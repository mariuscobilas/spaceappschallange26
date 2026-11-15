import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const dataset = JSON.parse(readFileSync("public/data/regional-yield.json", "utf8"));
const savedAt = "2026-11-15T12:00:00.000Z";
const point = { latitude: 39, longitude: -99, name: "North field", fieldId: "north" };
const budget = {
  grainPrice: "225", baselineYield: "5", yieldChange: "4", seedCost: "30",
  terminationCost: "8", subsidy: "0", areaHa: "12",
};
const savedPlan = {
  coverCrop: "rye", terminationDays: 25, plantingDate: "2027-04-20", areaHa: "12",
  notes: "Keep the spring stand.", location: point, crop: "wheat", savedAt, name: "Saved wheat plan",
  budget: { ...budget },
};
const planDraft = {
  coverCrop: "pea", terminationDays: 20, plantingDate: "2027-05-01", areaHa: "14",
  notes: "Draft remains separate from the snapshot.",
};
const economicsDraft = {
  grainPrice: "211", baselineYield: "6.5", yieldChange: "3", seedCost: "29",
  terminationCost: "9", subsidy: "2", areaHa: "14",
};

async function mockRegionalDataset(page: Page) {
  await page.route("**/api/v1/atlas/regional-yield", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(dataset),
  }));
}

async function seedPlanningWorkspace(page: Page) {
  await page.addInitScript(({ savedAtValue, savedPlanValue, planDraftValue, economicsValue }) => {
    const field = {
      id: "north", name: "North field", location: { latitude: 39, longitude: -99 },
      currentCrop: "wheat", cropSource: "manual", createdAt: savedAtValue, updatedAt: savedAtValue,
    };
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: field.id, fields: [field] }));
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({ "north|wheat": savedPlanValue }));
    localStorage.setItem("meridian.plan-drafts.v1", JSON.stringify({ "north|wheat": planDraftValue }));
    localStorage.setItem("meridian.economics.v2", JSON.stringify({ "north|wheat": economicsValue }));
  }, { savedAtValue: savedAt, savedPlanValue: savedPlan, planDraftValue: planDraft, economicsValue: economicsDraft });
}

async function readPlanningSnapshots(page: Page) {
  return page.evaluate(() => Object.fromEntries([
    "meridian.fields.v1",
    "meridian.field-plans.v2",
    "meridian.plan-drafts.v1",
    "meridian.economics.v2",
  ].map((key) => [key, localStorage.getItem(key)])));
}

async function openResearch(page: Page) {
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  await options.getByLabel("Data view", { exact: true }).selectOption("research");
  await expect(page).toHaveURL(/\/?view=research/);
  await expect(page.locator('footer[aria-label="Historical research map legend"]')).toBeVisible();
  await expect(options).toBeVisible();
  return options;
}

async function awaitResearchLoaded(page: Page) {
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-ready", "true", { timeout: 30000 });
}

test("research filters and H3 inspection preserve the active field, crop, drafts, budget and saved snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockRegionalDataset(page);
  await seedPlanningWorkspace(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Map options", exact: true })).toBeVisible();
  const before = await readPlanningSnapshots(page);

  await openResearch(page);
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  await awaitResearchLoaded(page);
  await expect(options.getByRole("status").filter({ hasText: "This study does not cover wheat." })).toBeVisible();
  await options.getByLabel("Research crop", { exact: true }).selectOption("soybeans");
  await options.getByLabel("Study period", { exact: true }).selectOption("2020");
  await options.getByLabel("County", { exact: true }).selectOption("19001");
  await expect(page).toHaveURL(/crop=soybeans&period=2020&county=19001/);
  await expect(page.getByRole("button", { name: "Map options", exact: true, includeHidden: true })).toHaveCount(1);
  await options.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByLabel("Research crop", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await page.getByRole("dialog", { name: "Map options", exact: true }).getByLabel("Data view", { exact: true }).selectOption("conditions");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("dialog", { name: "Map options", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  const map = page.getByRole("region", { name: "Interactive field map", exact: true });
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-resolution", /\d/, { timeout: 30000 });
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  await expect(async () => {
    await page.mouse.click(bounds!.x + bounds!.width * 0.5, bounds!.y + bounds!.height * 0.5);
    await expect(page.getByRole("dialog", { name: "Hexagon information", exact: true })).toBeVisible();
  }).toPass({ timeout: 15000 });
  const hexDetails = page.getByRole("dialog", { name: "Hexagon information", exact: true });
  await expect(hexDetails).toBeVisible();
  await expect(hexDetails.getByRole("button", { name: "Choose a field in this area", exact: true })).toBeVisible();
  expect(await readPlanningSnapshots(page)).toEqual(before);
});

test("Atlas links redirect to URL-backed research and phone county selection opens one details sheet", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 667 });
  await mockRegionalDataset(page);
  await page.goto("/");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-resolution", /\d/, { timeout: 30000 });
  const startOptions = await openResearch(page);
  await startOptions.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/atlas?view=research&crop=soybeans&period=2020&county=19001");
  await expect(page).toHaveURL(/\/?view=research&crop=soybeans&period=2020&county=19001$/);
  await awaitResearchLoaded(page);

  const initialDetails = page.getByRole("dialog").filter({ has: page.getByRole("region", { name: "Published county estimate details", exact: true }) });
  await expect(initialDetails).toBeVisible();
  await expect(initialDetails.getByRole("heading", { name: "Adair, IA", exact: true })).toBeVisible();
  await initialDetails.getByRole("button", { name: "Close", exact: true }).click();
  await expect(initialDetails).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/?view=research/);
  await page.goForward();
  await expect(page).toHaveURL(/county=19001$/);
  await expect(page.getByRole("dialog").filter({ has: page.getByRole("region", { name: "Published county estimate details", exact: true }) })).toBeVisible();
  await page.getByRole("dialog").filter({ has: page.getByRole("region", { name: "Published county estimate details", exact: true }) }).getByRole("button", { name: "Close", exact: true }).click();

  const toolbar = page.locator('header[aria-label="Map toolbar"]');
  await expect(toolbar.getByRole("button", { name: "Map options", exact: true })).toHaveCount(1);
  await expect(toolbar.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  const county = options.getByLabel("County", { exact: true });
  await county.focus();
  // Native select popup key behavior differs on macOS headless Chromium.
  // Select via its accessible control, then verify keyboard activation of Inspect.
  await county.selectOption("17001");
  await expect(county).not.toHaveValue("19001");
  await expect(county).toHaveValue(/\d{5}/);
  await options.getByRole("button", { name: "Inspect selected county", exact: true }).press("Enter");
  await expect(options).toBeHidden();
  const details = page.getByRole("dialog").filter({ has: page.getByRole("region", { name: "Published county estimate details", exact: true }) });
  await expect(details).toBeVisible();
  await expect(page.locator('[data-slot="sheet-content"]:visible')).toHaveCount(1);

  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeHidden();
  const viewport = page.getByRole("region", { name: "Interactive field map", exact: true });
  const footer = page.locator('footer[aria-label="Historical research map legend"]');
  const viewportBox = await viewport.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(viewportBox!.height).toBeGreaterThanOrEqual(667 * 0.65);
  expect(footerBox!.height).toBeLessThanOrEqual(80);
  expect(footerBox!.y).toBeGreaterThanOrEqual(viewportBox!.y + viewportBox!.height - 1);
  const attribution = page.locator(".maplibregl-ctrl-attrib").first();
  const attributionBox = await attribution.boundingBox();
  expect(attributionBox).not.toBeNull();
  expect(attributionBox!.y + attributionBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height + 1);
  expect(attributionBox!.y + attributionBox!.height).toBeLessThan(footerBox!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
