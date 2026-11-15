import { expect, test, type Page } from "@playwright/test";

const selection = (id: string, name: string) => ({ latitude: 38.99, longitude: -99.01, name, fieldId: id });
const field = (id: string, name: string, currentCrop: string) => ({ id, name, location: { latitude: 38.99, longitude: -99.01 }, currentCrop, cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const savedPlan = (id: string, name: string, crop: string, coverCrop: "rye" | "pea") => ({ location: selection(id, name), crop, coverCrop, terminationDays: 25, plantingDate: "2027-04-20", areaHa: "12.5", notes: "saved note", savedAt: "2026-11-14T10:00:00.000Z" });

async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("meridian.fields.v1")) return;
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "field-a", fields: [
      { id: "field-a", name: "North field", location: { latitude: 38.99, longitude: -99.01 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "field-b", name: "South field", location: { latitude: 39.01, longitude: -99.02 }, currentCrop: "soybeans", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ] }));
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({
      "field-a|wheat": { location: { latitude: 38.99, longitude: -99.01, name: "North field", fieldId: "field-a" }, crop: "wheat", coverCrop: "rye", terminationDays: 25, plantingDate: "2027-04-20", areaHa: "12.5", notes: "saved note", savedAt: "2026-11-14T10:00:00.000Z" },
      "field-b|corn": { location: { latitude: 39.01, longitude: -99.02, name: "South field", fieldId: "field-b" }, crop: "corn", coverCrop: "pea", terminationDays: 40, plantingDate: "2027-05-10", areaHa: "22", notes: "second note", savedAt: "2026-11-14T11:00:00.000Z" },
    }));
  });
}

test("lists confirmed plans, opens their saved field and crop, persists, and deletes only the selected plan", async ({ page }) => {
  await seed(page);
  await page.goto("/planner/saved");
  await expect(page.getByRole("heading", { name: "Saved plans" })).toBeVisible();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "North field" })).toBeVisible();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "South field" })).toBeVisible();
  await expect(page.getByText("Cereal rye")).toBeVisible();
  await expect(page.getByText("Winter pea")).toBeVisible();
  await page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: "South field" }) }).getByRole("button", { name: "Open in Planner" }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByText("South field · Corn")).toBeVisible();
  await expect(page.getByLabel("Cover crop", { exact: true })).toHaveValue("pea");
  const activeBeforeReload = await page.evaluate(() => ({ settings: JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"), fields: JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}") }));
  expect(activeBeforeReload.settings.crop).toBe("corn");
  expect(activeBeforeReload.fields.activeFieldId).toBe("field-b");
  await page.reload();
  await expect(page.getByText("South field · Corn")).toBeVisible();
  await page.goto("/planner/saved");
  await page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: "North field" }) }).getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete saved plan?" });
  await confirm.getByRole("button", { name: "Delete plan" }).click();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "North field" })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"));
  expect(Object.keys(stored)).toEqual(["field-b|corn"]);
  const fields = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields);
  expect(fields).toHaveLength(2);
});

test("compares two saved manual plans and exports their complete decision summary", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/planner/saved");
  await expect(page.getByRole("heading", { name: "Plan comparison" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare this plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Compare plans" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByTestId("saved-plan-card").filter({ hasText: "North field" }).getByRole("button", { name: "Compare this plan" }).click();
  await page.getByTestId("saved-plan-card").filter({ hasText: "South field" }).getByRole("button", { name: "Compare this plan" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Different field or crop contexts" })).toBeVisible();
  await expect(page.locator("article").getByText("March 26, 2027")).toBeVisible();
  await expect(page.getByText("Termination dates are calculated from saved planting dates and lead times; no model prediction is included.")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download comparison (.txt)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("field-shift-plan-comparison.txt");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(path!, "utf8");
  expect(text).toContain("Manual calendar plans; dates are calculated from the saved planting date and lead time. This is not a model prediction.");
  expect(text).toContain("Cash crop: Wheat");
  expect(text).toContain("Cover crop: Cereal rye");
  expect(text).toContain("Notes: saved note");
  expect(text).toContain("Area: 12.5 ha");
});

test("clears a deleted comparison selection and lets the user choose a replacement", async ({ page }) => {
  await seed(page);
  await page.goto("/planner/saved");
  await page.getByRole("button", { name: "Compare plans" }).click();
  await page.getByTestId("saved-plan-card").filter({ hasText: "North field" }).getByRole("button", { name: "Compare this plan" }).click();
  await page.getByTestId("saved-plan-card").filter({ hasText: "South field" }).getByRole("button", { name: "Compare this plan" }).click();
  await page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: "South field" }) }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete saved plan?" }).getByRole("button", { name: "Delete plan" }).click();
  await expect(page.getByText("A selected plan was removed. Clear the selection or select another saved plan.")).toBeVisible();
  await page.getByTestId("saved-plan-card").filter({ hasText: "North field" }).getByRole("button", { name: "Selected for comparison" }).click();
  await page.getByTestId("saved-plan-card").filter({ hasText: "North field" }).getByRole("button", { name: "Compare this plan" }).click();
  await expect(page.getByText("A selected plan was removed. Clear the selection or select another saved plan.")).toHaveCount(0);
});

test("saves plans for two different field and crop contexts", async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => { if (localStorage.getItem("saved-plans-flow-cleared")) return; localStorage.removeItem("meridian.field-plans.v2"); localStorage.setItem("saved-plans-flow-cleared", "1"); });
  const saveCalendar = async (fieldName: string, crop: string, date: string) => {
    await page.goto("/planner");
    await page.locator('[data-slot="card"]').filter({ hasText: fieldName }).getByRole("button", { name: "Create plan" }).click();
    await expect(page).toHaveURL(/\/planner\/calendar$/);
    await page.getByLabel("Next cash crop", { exact: true }).selectOption(crop);
    await page.getByLabel("Cash crop planting date").fill(date);
    await page.getByRole("button", { name: "Review calendar only" }).click();
    await expect(page).toHaveURL(/\/planner\/review\?budget=skip$/);
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Plan saved on this device.");
  };
  await saveCalendar("North field", "wheat", "2027-04-20");
  await saveCalendar("South field", "corn", "2027-05-10");
  const plans = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"));
  expect(plans["field-a|wheat"]).toBeTruthy();
  expect(plans["field-b|corn"]).toBeTruthy();
  await page.goto("/planner/saved");
  await expect(page.getByTestId("saved-plan-card")).toHaveCount(2);
});

test("opening a plan with a newer working draft explains the choice and restores only on request", async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => localStorage.setItem("meridian.plan-drafts.v1", JSON.stringify({
    "field-a|wheat": { coverCrop: "radish", terminationDays: 30, plantingDate: "2027-04-22", areaHa: "12.5", notes: "newer work" },
  })));
  await page.goto("/planner/saved");
  await expect(page.getByText(/A newer working draft exists/)).toBeVisible();
  await page.getByRole("button", { name: "Restore saved version" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Restore saved version?" });
  await confirm.getByRole("button", { name: "Restore saved version" }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await expect(page.getByLabel("Cover crop", { exact: true })).toHaveValue("rye");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.plan-drafts.v1") ?? "{}")["field-a|wheat"]);
  expect(draft.coverCrop).toBe("rye");
  expect(draft.notes).toBe("saved note");
});

test("removes migrated legacy plan aliases on delete and preserves unrelated legacy plans", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("saved-plans-legacy-seeded")) return;
    localStorage.setItem("saved-plans-legacy-seeded", "1");
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, fields: [{
      id: "west-field", name: "West field", benchmarkId: "tribune", location: { latitude: 38.4697, longitude: -101.7521 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }] }));
    const plan = (name: string, benchmarkId: string, latitude: number, longitude: number, crop: "wheat" | "corn") => ({
      location: { name, benchmarkId, latitude, longitude }, crop, coverCrop: "rye", terminationDays: 30,
      plantingDate: "2027-04-20", areaHa: "12", notes: "legacy plan", savedAt: "2026-11-14T10:00:00.000Z",
    });
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({ "west-field|wheat": { ...plan("West field", "tribune", 38.4697, -101.7521, "wheat"), location: { name: "West field", benchmarkId: "tribune", fieldId: "west-field", latitude: 38.4697, longitude: -101.7521 } } }));
    localStorage.setItem("meridian.field-plans.v1", JSON.stringify({
      "tribune|wheat": plan("Tribune", "tribune", 38.4697, -101.7521, "wheat"),
      "colby|corn": plan("Colby", "colby", 39.3958, -101.0524, "corn"),
    }));
  });
  await page.goto("/planner/saved");
  await expect(page.locator('[data-slot="card-title"]', { hasText: "West field" })).toHaveCount(1);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Colby" })).toHaveCount(1);
  await page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: "West field" }) })
    .getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete saved plan?" }).getByRole("button", { name: "Delete plan" }).click();
  await page.reload();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Tribune" })).toHaveCount(0);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Colby" })).toHaveCount(1);
  const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.field-plans.v1") ?? "{}"));
  expect(Object.keys(legacy)).toEqual(["colby|corn"]);
});
