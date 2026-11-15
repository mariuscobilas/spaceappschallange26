import { expect, test } from "@playwright/test";
import { initialSettings, emptyEconomics, emptyPlan } from "../lib/workspace";
import { MAX_BACKUP_BYTES, parseWorkspaceBackup } from "../lib/workspace-backup";

const backup = () => JSON.stringify({
  version: 1, exportedAt: "2026-11-14T10:00:00.000Z", settings: initialSettings,
  fields: [], plans: {}, drafts: { "benchmark-1|wheat": emptyPlan }, economics: { "benchmark-1|wheat": emptyEconomics }, unitSystem: "us",
});

test("accepts supported client workspace backup and keeps unit preference", () => {
  expect(parseWorkspaceBackup(backup())).toMatchObject({ version: 1, unitSystem: "us", drafts: { "benchmark-1|wheat": emptyPlan } });
});

test("accepts optional season facts while rejecting invalid fact years and identities", () => {
  const value = JSON.parse(backup());
  value.seasonFacts = [{ fieldId: "field-1", planningYear: 2027, irrigation: "unknown", sourceMessageId: "msg-1", contextVersion: "v1", text: "Irrigation unconfirmed", savedAt: "2026-11-14T10:00:00.000Z" }];
  expect(parseWorkspaceBackup(JSON.stringify(value)).seasonFacts).toHaveLength(1);
  value.seasonFacts[0].planningYear = 2300;
  expect(() => parseWorkspaceBackup(JSON.stringify(value))).toThrow(/season facts/i);
});

test("rejects unsupported versions, unsafe keys, invalid records and orphan field references", () => {
  const unsupported = JSON.parse(backup()); unsupported.version = 99;
  expect(() => parseWorkspaceBackup(JSON.stringify(unsupported))).toThrow(/unsupported version/i);
  const unsafe = JSON.parse(backup()); unsafe.economics.constructor = emptyEconomics;
  expect(() => parseWorkspaceBackup(JSON.stringify(unsafe))).toThrow(/invalid/i);
  const orphan = JSON.parse(backup()); orphan.plans["missing|wheat"] = { ...emptyPlan, location: { ...initialSettings.selection, fieldId: "missing" }, crop: "wheat", savedAt: "2026-11-14T10:00:00.000Z" };
  expect(() => parseWorkspaceBackup(JSON.stringify(orphan))).toThrow(/missing/i);
});

test("enforces the 5 MB file limit before parsing", () => {
  expect(MAX_BACKUP_BYTES).toBe(5 * 1024 * 1024);
  expect(() => parseWorkspaceBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow(/5 MB/i);
});

test("reviews and merges a backup, preserving local collisions and restoring all browser data", async ({ page }) => {
  const fields = [
    { id: "local-field", name: "Local field", location: { latitude: 38.9, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "import-field", name: "Imported field", location: { latitude: 39, longitude: -99 }, currentCrop: "corn", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  await page.addInitScript((seedFields) => {
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, fields: [seedFields[1]] }));
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({ "import-field|corn": { location: { ...seedFields[1].location, name: "Local field", fieldId: "import-field" }, crop: "corn", coverCrop: "pea", terminationDays: 20, plantingDate: "2027-04-20", areaHa: "3", notes: "keep local", savedAt: "2026-01-01T00:00:00.000Z" } }));
    localStorage.setItem("meridian.unit-system.v1", "metric");
  }, fields);
  const imported = {
    version: 1, exportedAt: "2026-11-14T10:00:00.000Z",
    settings: { ...initialSettings, crop: "corn", selection: { latitude: 39, longitude: -99, name: "Imported field", fieldId: "import-field" } },
    fields, activeFieldId: "import-field",
    plans: { "import-field|corn": { location: { latitude: 39, longitude: -99, name: "Imported field", fieldId: "import-field" }, crop: "corn", coverCrop: "rye", terminationDays: 25, plantingDate: "2027-04-20", areaHa: "12", notes: "backup plan", savedAt: "2026-11-14T10:00:00.000Z" } },
    drafts: { "import-field|corn": { ...emptyPlan, notes: "backup draft" } },
    economics: { "import-field|corn": { ...emptyEconomics, grainPrice: "210" } }, unitSystem: "us",
    seasonFacts: [{ fieldId: "import-field", planningYear: 2027, irrigation: "available", sourceMessageId: "msg-fact", contextVersion: "v1", text: "Irrigation confirmed available", savedAt: "2026-11-14T10:00:00.000Z" }],
  };
  await page.goto("/planner");
  await page.getByRole("button", { name: "Workspace backup" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "meridian.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByText("2 fields · 1 plans · 1 drafts · 1 economics records · U.S. units")).toBeVisible();
  await page.getByRole("button", { name: "Import and merge" }).click();
  await expect(page.getByText(/Import complete/)).toBeVisible();
  const saved = await page.evaluate(() => ({
    fields: JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields,
    plans: JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"),
    drafts: JSON.parse(localStorage.getItem("meridian.plan-drafts.v1") ?? "{}"),
    economics: JSON.parse(localStorage.getItem("meridian.economics.v2") ?? "{}"),
    settings: JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"), units: localStorage.getItem("meridian.unit-system.v1"),
    facts: JSON.parse(localStorage.getItem("meridian.season-facts.v1") ?? "[]"),
  }));
  expect(saved.fields.map((field: { id: string }) => field.id)).toEqual(["import-field", "local-field"]);
  expect(saved.plans["import-field|corn"].notes).toBe("keep local");
  expect(saved.drafts["import-field|corn"].notes).toBe("backup draft");
  expect(saved.economics["import-field|corn"].grainPrice).toBe("210");
  expect(saved.settings.crop).toBe("corn");
  expect(saved.units).toBe("us");
  expect(saved.facts).toMatchObject([{ fieldId: "import-field", planningYear: 2027 }]);
});

test("shows invalid backup feedback and leaves storage untouched", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Opening Meridian…")).toHaveCount(0);
  const before = await page.evaluate(() => localStorage.getItem("meridian.fields.v1"));
  await page.getByRole("button", { name: "Workspace backup" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(page.getByText("This file is not valid JSON.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("meridian.fields.v1"))).toBe(before);
});

test("exports a downloadable JSON backup that parses back with settings and units", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("meridian.unit-system.v1", "us"));
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meridian-workspace-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const parsed = parseWorkspaceBackup(await readFile(path!, "utf8"));
  expect(parsed).toMatchObject({ version: 1, settings: initialSettings, unitSystem: "us", fields: [] });
});

test("exports canonical plans when storage contains a migrated benchmark alias", async ({ page }) => {
  const savedAt = "2026-11-14T10:00:00.000Z";
  const field = { id: "field-tribune", name: "Tribune field", location: { latitude: 38.4697, longitude: -101.7521 }, currentCrop: "wheat", cropSource: "manual", benchmarkId: "tribune", createdAt: savedAt, updatedAt: savedAt };
  const plan = { coverCrop: "rye", terminationDays: 30, plantingDate: "2027-04-20", areaHa: "12", notes: "same plan", savedAt };
  await page.addInitScript(({ fieldValue, planValue }) => {
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, fields: [fieldValue] }));
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({
      "tribune|wheat": { ...planValue, location: { latitude: 38.4697, longitude: -101.7521, name: "Tribune", benchmarkId: "tribune" }, crop: "wheat" },
      "field-tribune|wheat": { ...planValue, location: { latitude: 38.4697, longitude: -101.7521, name: "Tribune field", fieldId: "field-tribune", benchmarkId: "tribune" }, crop: "wheat" },
    }));
  }, { fieldValue: field, planValue: plan });
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const parsed = parseWorkspaceBackup(await readFile(path!, "utf8"));
  expect(Object.keys(parsed.plans)).toEqual(["field-tribune|wheat"]);
  expect(parsed.plans["field-tribune|wheat"].location.fieldId).toBe("field-tribune");
});

test("rolls back earlier storage writes when quota fails partway through import", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("meridian.unit-system.v1", "metric");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if ((window as Window & { failBackupWrite?: boolean }).failBackupWrite && key === "meridian.season-facts.v1") throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace backup" }).click();
  const before = await page.evaluate(() => ["meridian.map-settings.v3", "meridian.fields.v1", "meridian.field-plans.v2", "meridian.plan-drafts.v1", "meridian.economics.v2", "meridian.unit-system.v1", "meridian.season-facts.v1"].map((key) => localStorage.getItem(key)));
  await page.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup()) });
  await page.evaluate(() => { (window as Window & { failBackupWrite?: boolean }).failBackupWrite = true; });
  await page.getByRole("button", { name: "Import and merge" }).click();
  await expect(page.getByText(/Import could not be saved/)).toBeVisible();
  const after = await page.evaluate(() => ["meridian.map-settings.v3", "meridian.fields.v1", "meridian.field-plans.v2", "meridian.plan-drafts.v1", "meridian.economics.v2", "meridian.unit-system.v1", "meridian.season-facts.v1"].map((key) => localStorage.getItem(key)));
  expect(after).toEqual(before);
});

test("keeps backup controls reachable on a narrow viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Workspace backup" }).click();
  await expect(page.getByRole("heading", { name: "Workspace backup" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
