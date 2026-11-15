import { expect, test, type Page } from "@playwright/test";
import { parseWorkspaceBackup } from "../lib/workspace-backup";
import { validPlan, planStorageKey } from "../lib/workspace";

async function seedField(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("planner-test-seeded")) return;
    const field = { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z" };
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: field.id, fields: [field] }));
    localStorage.setItem("planner-test-seeded", "1");
  });
}

async function startCalendar(page: Page) {
  await seedField(page);
  await page.goto("/planner");
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await page.getByLabel("Cash crop planting date", { exact: true }).fill("2027-04-15");
}

async function currentPlans(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"));
}

test("empty library starts with a field and mobile calendar exposes inputs before explanations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planner");
  await expect(page.getByRole("link", { name: "Add first field", exact: true })).toBeVisible();
  await expect(page.getByLabel("Field or location")).toHaveCount(0);
  await expect(page.getByText(/Kansas/)).toHaveCount(0);
  await page.goto("/planner/calendar");
  await expect(page.getByRole("button", { name: "Choose a field", exact: true })).toBeVisible();
  await expect(page.getByLabel("Cash crop planting date")).toHaveCount(0);
  await startCalendar(page);
  const input = page.getByLabel("Cash crop planting date", { exact: true });
  const box = await input.boundingBox();
  expect(box!.y).toBeLessThan(420);
  await expect(page.getByRole("button", { name: "Continue to budget", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Review calendar only", exact: true }).click();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("Plan saved on this device.", { exact: true })).toBeVisible();
  const plans = await currentPlans(page);
  expect(plans["north|wheat"].budget).toBeUndefined();
  expect(plans["north|wheat"].plantingDate).toBe("2027-04-15");
});

test("calendar, budget and alternatives save together and round-trip through backup", async ({ page }) => {
  await startCalendar(page);
  await page.getByText("Field area and notes", { exact: true }).click();
  await page.getByLabel("Field area (ha)", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Continue to budget", exact: true }).click();
  const assumptions = { "Grain price": "200", "Baseline yield": "5", "Assumed yield change": "-10", "Seed cost": "30", "Termination cost": "10", "Subsidy": "0" };
  for (const [label, value] of Object.entries(assumptions)) await page.locator(`#economics-${({ "Grain price": "grainPrice", "Baseline yield": "baselineYield", "Assumed yield change": "yieldChange", "Seed cost": "seedCost", "Termination cost": "terminationCost", "Subsidy": "subsidy" } as Record<string,string>)[label]}`).fill(value);
  await page.getByRole("button", { name: "Review plan", exact: true }).click();
  await page.getByLabel("Plan name").fill("Original calendar and budget");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("Plan saved on this device.", { exact: true })).toBeVisible();
  const original = (await currentPlans(page))["north|wheat"];
  expect(original.budget.areaHa).toBe("40");
  expect(original.budget.grainPrice).toBe("200");
  expect(validPlan(original)).toBe(true);
  await page.getByRole("button", { name: "Edit calendar", exact: true }).click();
  await page.getByLabel("Cash crop planting date", { exact: true }).fill("2027-04-25");
  expect((await currentPlans(page))["north|wheat"]).toEqual(original);
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Review", exact: true }).click();
  await page.getByLabel("Plan name").fill("Later planting alternative");
  await page.getByRole("button", { name: "Save as alternative", exact: true }).click();
  await expect(page.getByText("Alternative plan saved on this device.", { exact: true })).toBeVisible();
  const plans = await currentPlans(page);
  expect(Object.keys(plans)).toHaveLength(2);
  expect(plans["north|wheat"]).toEqual(original);
  const alternative = Object.values(plans).find((p: any) => p.id) as any;
  expect(alternative.plantingDate).toBe("2027-04-25");
  expect(plans[planStorageKey(alternative)]).toEqual(alternative);
  await page.getByRole("button", { name: "Workspace backup", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const backup = parseWorkspaceBackup(Buffer.concat(chunks).toString());
  expect(Object.keys(backup.plans)).toHaveLength(2);
  expect(backup.plans[planStorageKey(alternative)]).toEqual(alternative);
  await page.getByRole("dialog", { name: "Workspace backup", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "View saved plans", exact: true }).click();
  await expect(page.getByTestId("saved-plan-card")).toHaveCount(2);
  const card = page.getByTestId("saved-plan-card").filter({ hasText: "Later planting alternative" });
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Delete/, exact: false }).click();
  await expect(page.getByTestId("saved-plan-card")).toHaveCount(1);
  expect((await currentPlans(page))["north|wheat"]).toEqual(original);
});

test("incomplete budget can be skipped and draft resumes after reload", async ({ page }) => {
  await startCalendar(page);
  await page.getByRole("button", { name: "Continue to budget", exact: true }).click();
  await page.locator("#economics-grainPrice").fill("200");
  await page.getByRole("link", { name: "Back to fields", exact: true }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await page.reload();
  await expect(page.getByText("Draft in progress", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue draft", exact: true }).click();
  await expect(page).toHaveURL(/\/economics$/);
  await expect(page.locator("#economics-grainPrice")).toHaveValue("200");
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save plan", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save calendar only", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save plan", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  expect((await currentPlans(page))["north|wheat"].budget).toBeUndefined();
});

test("restoring a saved version restores its budget and calendar while a skipped-budget alternative preserves the original", async ({ page }) => {
  await seedField(page);
  await page.goto("/planner");
  const original = await page.evaluate(() => {
    const plan = { snapshotVersion: 1, name: "Confirmed original", coverCrop: "rye", terminationDays: 30, plantingDate: "2027-04-15", areaHa: "40", notes: "Original notes", crop: "wheat", location: { name: "North field", fieldId: "north", latitude: 39, longitude: -99 }, savedAt: "2026-11-15T12:00:00Z", budget: { grainPrice: "200", baselineYield: "5", yieldChange: "-10", seedCost: "30", terminationCost: "10", subsidy: "0", areaHa: "40" } };
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({ "north|wheat": plan }));
    localStorage.setItem("meridian.plan-drafts.v1", JSON.stringify({ "north|wheat": { coverCrop: "pea", terminationDays: 20, plantingDate: "2027-05-01", areaHa: "40", notes: "New draft" } }));
    localStorage.setItem("meridian.economics.v2", JSON.stringify({ "north|wheat": { ...plan.budget, grainPrice: "300" } }));
    return plan;
  });
  await page.goto("/planner/saved");
  await page.getByRole("button", { name: "Restore saved version", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("calendar and budget");
  await dialog.getByRole("button", { name: "Restore saved version", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await expect(page.getByLabel("Cash crop planting date", { exact: true })).toHaveValue("2027-04-15");
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.locator("#economics-grainPrice")).toHaveValue("200");
  await page.locator("#economics-grainPrice").fill("400");
  expect((await currentPlans(page))["north|wheat"]).toEqual(original);
  await page.getByRole("button", { name: "Continue without budget", exact: true }).click();
  await expect(page.getByText("This plan will not include a budget.", { exact: true })).toBeVisible();
  await page.getByLabel("Plan name").fill("Calendar-only alternative");
  await page.getByRole("button", { name: "Save as alternative", exact: true }).click();
  await expect(page.getByText("Alternative plan saved on this device.", { exact: true })).toBeVisible();
  const plans = await currentPlans(page);
  expect(plans["north|wheat"]).toEqual(original);
  expect((Object.values(plans).find((p: any) => p.id) as any).budget).toBeUndefined();
});

test("Budget has read-only context, two next actions, and shows only estimated return for a negative yield change", async ({ page }) => {
  await startCalendar(page);
  await expect(page.locator('header').getByRole("combobox")).toHaveCount(0);
  await expect(page.getByLabel("Plan context")).toContainText("North field");
  await page.getByRole("button", { name: "Continue to budget", exact: true }).click();
  const inputs = { grainPrice: "200", baselineYield: "5", yieldChange: "-10", seedCost: "30", terminationCost: "10", subsidy: "0", areaHa: "40" };
  for (const [key, value] of Object.entries(inputs)) await page.locator(`#economics-${key}`).fill(value);
  await expect(page.locator('header').getByRole("combobox")).toHaveCount(0);
  const next = page.getByRole("navigation", { name: "Next steps", exact: true });
  await expect(next.getByRole("button")).toHaveCount(2);
  await expect(next.getByRole("button", { name: "Prepare evidence request", exact: true })).toHaveCount(0);
  await expect(page.getByText("Estimated return / ha", { exact: true }).locator("..")).toContainText("$860.00");
  await expect(page.getByText("Whole-field estimated return", { exact: true }).locator("..")).toContainText("$34,400.00");
  await expect(page.getByText(/Change vs baseline|Total change for/)).toHaveCount(0);
  await expect(page.getByText("Calculation details", { exact: true }).locator("..")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "U.S. customary units", exact: true }).click();
  await expect(page.getByText("Whole-field estimated return", { exact: true }).locator("..")).toContainText("$34,400.00");
});
