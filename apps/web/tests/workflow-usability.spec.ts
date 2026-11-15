import { choosePlannerField } from "./helpers/planner";
import { readFileSync } from "node:fs";

const countyStudy = JSON.parse(readFileSync("../../shared/payloads/regional-yield-available.json", "utf8"));
import { expect, test } from "@playwright/test";

test("working calendar drafts follow each field through navigation, reload and unit changes", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("meridian.fields.v1")) return;
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
      { id: "south", name: "South field", location: { latitude: 38, longitude: -99 }, currentCrop: "corn", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Create plan", exact: true }).first().click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await expect(page.getByLabel("Plan context")).toContainText("North field");
  await page.getByLabel("Cash crop planting date").fill("2027-04-20");
  await page.getByText("Field area and notes", { exact: true }).click();
  await page.getByLabel("Notes").fill("Check field moisture before confirming timing.");
  await page.getByLabel("Field area (ha)").fill("100");
  await expect(page.getByText("March 21, 2027", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Use acres", exact: true }).click();
  await expect(page.getByLabel("Field area (ac)")).toHaveValue(/247\.105/);
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByLabel("Plan context")).toContainText("North field");
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByText("Field area and notes", { exact: true }).click();
  await expect(page.getByLabel("Notes")).toHaveValue("Check field moisture before confirming timing.");
  await page.reload();
  await expect(page.getByLabel("Cash crop planting date")).toHaveValue("2027-04-20");
  await page.getByText("Field area and notes", { exact: true }).click();
  await choosePlannerField(page, "South field");
  await expect(page.getByLabel("Next cash crop", { exact: true })).toHaveValue("corn");
  await page.getByText("Field area and notes", { exact: true }).click();
  await expect(page.getByLabel("Notes")).toHaveValue("");
  await page.getByLabel("Notes").fill("South plan");
  await choosePlannerField(page, "North field");
  await page.getByText("Field area and notes", { exact: true }).click();
  await expect(page.getByLabel("Notes")).toHaveValue("Check field moisture before confirming timing.");
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
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

test("research county navigation does not create a field until Select point is used", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json: countyStudy }));
  await page.goto("/?view=research");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await expect(page.getByLabel("County", { exact: true })).toBeEnabled();
  await page.getByLabel("County", { exact: true }).selectOption("17001");
  await page.getByRole("button", { name: "Inspect selected county", exact: true }).click();
  const researchDetails = page.getByRole("complementary", { name: "Region overview", exact: true });
  await expect(researchDetails).toContainText("Adams, IL");
  await expect(researchDetails.getByRole("button", { name: "Choose a field in this area", exact: true })).toBeEnabled();
  await researchDetails.getByRole("button", { name: "Choose a field in this area", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);

  const fieldsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields ?? []);
  expect(fieldsBefore).toHaveLength(0);
  await expect(page.getByText("No fields saved yet")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Field details", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Select point", exact: true }).click();
  await expect(page.getByText("Click the map to place a field point.")).toBeVisible();
  await expect(page.getByText("No fields saved yet")).toBeVisible();

  const map = page.locator(".map-canvas");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map bounds unavailable");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Field area (ha)")).toHaveValue("");
  const fieldsAfterPoint = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields ?? []);
  expect(fieldsAfterPoint).toHaveLength(0);
});
