import { expect, test, type Page } from "@playwright/test";

const now = "2026-11-15T12:00:00.000Z";

async function seedDeletionData(page: Page) {
  await page.addInitScript(({ timestamp }) => {
    const removed = { id: "remove", name: "Remove me", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: timestamp, updatedAt: timestamp };
    const keep = { id: "keep", name: "Keep me", location: { latitude: 39.1, longitude: -99.1 }, currentCrop: "soybeans", cropSource: "manual", createdAt: timestamp, updatedAt: timestamp };
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "remove", fields: [removed, keep] }));
    const plan = { location: { ...removed.location, name: removed.name, fieldId: removed.id }, crop: "wheat", coverCrop: "rye", terminationDays: 30, plantingDate: "", areaHa: "", notes: "Keep the record count honest.", savedAt: timestamp };
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({ "remove|wheat": plan }));
    localStorage.setItem("meridian.plan-drafts.v1", JSON.stringify({ "remove|wheat": { coverCrop: "pea", terminationDays: 25, plantingDate: "", areaHa: "", notes: "Draft" } }));
    localStorage.setItem("meridian.economics.v2", JSON.stringify({ "remove|wheat": { grainPrice: "", baselineYield: "", yieldChange: "", seedCost: "", terminationCost: "", subsidy: "", areaHa: "" } }));
  }, { timestamp: now });
}

test("saves a point field, saves a second edit, reloads, and deletes it from its saved-field card", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/fields");
  const selectPoint = page.getByRole("button", { name: "Select point", exact: true });
  await expect(selectPoint).toBeEnabled({ timeout: 30_000 });
  await selectPoint.click();
  const canvas = page.locator(".map-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  let editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Point one");
  await editor.getByRole("button", { name: "Save field", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "My fields", exact: true });
  await expect(panel.getByRole("status")).toHaveText("Point one saved on this device.");
  await panel.getByRole("button", { name: "Point one", exact: true }).click();
  await page.getByRole("dialog", { name: "Point one", exact: true }).getByRole("button", { name: "Edit field details", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Point one revised");
  await editor.getByRole("button", { name: "Save field", exact: true }).click();
  await expect(panel).toContainText("Point one revised");
  await expect(panel.getByRole("status")).toHaveText("Point one revised saved on this device.");
  await page.reload();
  const restored = page.getByRole("complementary", { name: "My fields", exact: true });
  await expect(restored).toContainText("Point one revised");
  await restored.getByRole("button", { name: "Delete Point one revised", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete Point one revised?", exact: true });
  await expect(confirmation).toContainText("Other saved fields will remain.");
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(restored.getByRole("button", { name: "Point one revised", exact: true })).toHaveCount(0);
  await expect(restored.getByRole("status")).toContainText("deleted from this device");
});

test("saves a drawn boundary, edits its saved details, and retains its area after reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/fields");
  const canvas = page.locator(".map-canvas");
  for (let index = 0; index < 7; index++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const draw = page.getByRole("button", { name: "Draw boundary", exact: true });
  await expect(draw).toBeEnabled({ timeout: 30_000 });
  await draw.click();
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  const cx = bounds.x + bounds.width * 0.44;
  const cy = bounds.y + bounds.height * 0.42;
  for (const [x, y] of [[-42, -42], [42, -42], [42, 42], [-42, 42]]) await page.mouse.click(cx + x, cy + y);
  await page.getByRole("button", { name: "Finish boundary", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Boundary one");
  await editor.getByRole("button", { name: "Save field", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "My fields", exact: true });
  await expect(panel.getByRole("status")).toHaveText("Boundary one saved on this device.");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields[0]);
  expect(before.boundary?.coordinates?.[0]?.length).toBeGreaterThanOrEqual(4);
  expect(before.areaHectares).toBeGreaterThan(0);

  await panel.getByRole("button", { name: "Boundary one", exact: true }).click();
  await page.getByRole("dialog", { name: "Boundary one", exact: true }).getByRole("button", { name: "Edit field details", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Field details", exact: true });
  await edit.getByLabel("Field name", { exact: true }).fill("Boundary one revised");
  await edit.getByRole("button", { name: "Save field", exact: true }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields[0]);
  expect(after.name).toBe("Boundary one revised");
  expect(after.boundary).toEqual(before.boundary);
  expect(after.areaHectares).toBe(before.areaHectares);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "My fields", exact: true })).toContainText("Boundary one revised");
  await expect(page.getByRole("complementary", { name: "My fields", exact: true })).toContainText("Wheat · Boundary");
});

test("deletion explains related records, removes only the chosen field, and preserves another unsaved field edit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await seedDeletionData(page);
  await page.goto("/fields");
  const panel = page.getByRole("complementary", { name: "My fields", exact: true });
  await panel.getByRole("button", { name: "Keep me", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Keep me", exact: true });
  await details.getByRole("button", { name: "Edit field details", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Unsaved keep edit");
  await editor.getByRole("button", { name: "Close", exact: true }).click();

  await panel.getByRole("button", { name: "Delete Remove me", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete Remove me?", exact: true });
  await expect(confirmation).toContainText("1 saved plan");
  await expect(confirmation).toContainText("1 plan draft");
  await expect(confirmation).toContainText("1 saved economics input");
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Remove me", exact: true })).toHaveCount(0);
  await expect(panel).toContainText("Keep me");
  const persisted = await page.evaluate(() => ({
    fields: JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields,
    plans: JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"),
    drafts: JSON.parse(localStorage.getItem("meridian.plan-drafts.v1") ?? "{}"),
    economics: JSON.parse(localStorage.getItem("meridian.economics.v2") ?? "{}"),
  }));
  expect(persisted.fields.map((field: { id: string }) => field.id)).toEqual(["keep"]);
  expect(persisted.plans).toEqual({});
  expect(persisted.drafts).toEqual({});
  expect(persisted.economics).toEqual({});

  await page.getByRole("button", { name: "Selected location details", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Field details", exact: true }).getByLabel("Field name", { exact: true })).toHaveValue("Unsaved keep edit");
});

