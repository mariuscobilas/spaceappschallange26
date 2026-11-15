import { expect, test } from "@playwright/test";

test("working termination drafts follow each field through navigation, reload and unit changes", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("meridian.fields.v1")) return;
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
      { id: "south", name: "South field", location: { latitude: 38, longitude: -99 }, currentCrop: "corn", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
  await page.goto("/planner");
  await expect(page.getByLabel("Field or location")).toHaveValue("field:north");
  await page.getByLabel("Cash crop planting date").fill("2027-04-20");
  await page.getByLabel("Notes").fill("Check field moisture before confirming timing.");
  await page.getByLabel("Field area (ha)").fill("100");
  await expect(page.getByLabel("Termination calendar")).toContainText("March 21, 2027");
  await page.getByRole("button", { name: "Use acres", exact: true }).click();
  await expect(page.getByLabel("Field area (ac)")).toHaveValue(/247\.105/);
  await page.getByRole("link", { name: "Economics", exact: true }).click();
  await expect(page.getByLabel("Field or location")).toHaveValue("field:north");
  await page.getByRole("link", { name: "Field Planner", exact: true }).click();
  await expect(page.getByLabel("Notes")).toHaveValue("Check field moisture before confirming timing.");
  await page.reload();
  await expect(page.getByLabel("Cash crop planting date")).toHaveValue("2027-04-20");
  await page.getByLabel("Field or location").selectOption("field:south");
  await expect(page.getByLabel("Cash crop", { exact: true })).toHaveValue("corn");
  await expect(page.getByLabel("Notes")).toHaveValue("");
  await page.getByLabel("Notes").fill("South plan");
  await page.getByLabel("Field or location").selectOption("field:north");
  await expect(page.getByLabel("Notes")).toHaveValue("Check field moisture before confirming timing.");
  await page.getByRole("button", { name: "Save field plan", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}")["north|wheat"]);
  expect(saved.areaHa).toBe("100");
});

test("Ask Meridian exports the prepared question with explicit unavailable evidence context", async ({ page }) => {
  await page.route("**/api/v1/field-conditions?**", (route) => route.abort());
  await page.goto("/intel");
  await page.getByLabel("Your question").fill("What should I verify before planting?");
  const prepared = page.getByLabel("Prepared request");
  await expect(prepared).toHaveValue(/30-day precipitation: Unavailable/);
  await expect(prepared).toHaveValue(/NASA POWER/);
  await expect(prepared).toHaveValue(/period unavailable/);
  await expect(prepared).toHaveValue(/not field-wide measurements/);
  await expect(page.getByRole("note").filter({ hasText: "Analysis is not connected yet" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .txt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("meridian-request.txt");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(path!, "utf8");
  expect(text).toContain("What should I verify before planting?");
  expect(text).toContain("NASA POWER (https://power.larc.nasa.gov/");
  expect(text).toContain("Field conditions requested for");
});

test("Atlas drilldown starts an editable point at the regional centroid without treating the hex as a parcel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  await page.getByLabel("Cash crop", { exact: true }).selectOption("corn");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-resolution", "2", { timeout: 30000 });
  const region = page.getByRole("complementary", { name: "Region overview", exact: true });
  await expect(async () => {
    await page.mouse.click(800, 400);
    await expect(region).toBeVisible();
  }).toPass({ timeout: 20000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  await region.getByRole("button", { name: "Inspect field here", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Cash crop", { exact: true })).toHaveValue("corn");
  await expect(editor.getByLabel("Field area (ha)")).toHaveValue("");
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  expect(after.mode).toBe("field");
  expect(after.selection.latitude).toBe(before.selection.latitude);
  expect(after.selection.longitude).toBe(before.selection.longitude);
  expect(after.selection.boundary).toBeUndefined();
});
