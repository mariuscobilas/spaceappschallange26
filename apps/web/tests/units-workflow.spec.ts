import { choosePlannerField } from "./helpers/planner";
import { expect, test, type Page } from "@playwright/test";
import { analyzeBoundary } from "../lib/fields/geometry";

const now = new Date().toISOString();

function field(id: string, name: string, west: number) {
  const east = west + 0.01;
  return {
    id,
    name,
    location: { latitude: 38.99, longitude: west },
    boundary: {
      type: "Polygon" as const,
      coordinates: [[[west, 38.99], [east, 38.99], [east, 39], [west, 39], [west, 38.99]]] as [number, number][][],
    },
    currentCrop: "wheat",
    cropSource: "manual",
    createdAt: now,
    updatedAt: now,
  };
}

async function seedFields(page: Page) {
  await page.addInitScript((items) => {
    localStorage.setItem("fields-workflow-seeded", "1");
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "field-a", fields: items }));
  }, [field("field-a", "North field", -99.01), field("field-b", "South field", -99.02)]);
}

async function seedPointField(page: Page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
}

test("keeps economics drafts isolated by field and unit switches leave canonical values and results unchanged", async ({ page }) => {
  await seedFields(page);
  await page.goto("/economics");

  await page.getByLabel("Grain price (USD/tonne)").fill("201.123456789");
  await page.getByLabel("Baseline yield (tonnes/ha)").fill("7.25");
  await page.getByLabel("Assumed yield change (%)").fill("5");
  await page.getByLabel("Seed cost (USD/ha)").fill("34");
  await page.getByLabel("Termination cost (USD/ha)").fill("18");
  await page.getByLabel("Subsidy (USD/ha)").fill("6");
  await expect(page.getByText("Whole-field estimated return", { exact: true })).toBeVisible();
  const parcelTotal = page.getByText("Whole-field estimated return", { exact: true }).locator("..").locator("p").last();
  const total = await parcelTotal.textContent();
  const before = await page.evaluate(() => localStorage.getItem("meridian.economics.v2"));

  await choosePlannerField(page, "South field", "Budget");
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("");
  await expect(page.getByLabel("Baseline yield (tonnes/ha)")).toHaveValue("");
  await choosePlannerField(page, "North field", "Budget");
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("201.123456789");

  await page.getByRole("button", { name: "U.S. customary units" }).click();
  await expect(page.getByLabel("Grain price (USD/bu)")).toHaveValue(/\d/);
  await expect(parcelTotal).toHaveText(total!);
  const perAcre = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format((201.123456789 * 7.25 * 1.05 - 34 - 18 + 6) / 2.4710538147);
  await expect(page.getByText("Estimated return / ac", { exact: true }).locator("..")).toContainText(perAcre);
  await page.getByRole("button", { name: "Metric units" }).click();
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("201.123456789");
  const after = await page.evaluate(() => localStorage.getItem("meridian.economics.v2"));
  expect(after).toBe(before);
  await expect(parcelTotal).toHaveText(total!);
});

test("shows per-area economics before acreage and withholds only the parcel total", async ({ page }) => {
  await seedPointField(page);
  await page.goto("/economics");
  for (const [label, value] of [["Grain price", "100"], ["Baseline yield", "1"], ["Assumed yield change", "0"], ["Seed cost", "10"], ["Termination cost", "5"], ["Subsidy", "0"]]) {
    await page.getByLabel(label).fill(value);
  }
  await expect(page.getByText("Estimated return / ha", { exact: true }).locator("..")).toContainText("$85.00");
  await expect(page.getByText("Enter a valid field area", { exact: true })).toBeVisible();
  await page.getByLabel("Field area (ha)").fill("2");
  await expect(page.getByText("Whole-field estimated return", { exact: true }).locator("..")).toContainText("$170.00");
});

test("U.S. acre inputs calculate total return from the full field acreage and match metric total", async ({ page }) => {
  await seedPointField(page);
  await page.goto("/economics");
  await page.getByRole("button", { name: "U.S. customary units" }).click();
  await page.getByLabel("Grain price (USD/bu)").fill("4");
  await page.getByLabel("Baseline yield (bu/ac)").fill("150");
  await page.getByLabel("Assumed yield change (%)").fill("-10");
  await page.getByLabel("Seed cost (USD/ac)").fill("20");
  await page.getByLabel("Termination cost (USD/ac)").fill("5");
  await page.getByLabel("Subsidy (USD/ac)").fill("0");
  await page.getByLabel("Field area (ac)").fill("100");

  const total = page.getByText("Whole-field estimated return", { exact: true }).locator("..").locator("p").last();
  await expect(page.getByText("Estimated return / ac", { exact: true }).locator(".."))
    .toContainText("$515.00");
  await expect(total).toHaveText("$51,500.00");

  await page.getByRole("button", { name: "Metric units" }).click();
  await expect(page.getByLabel("Field area (ha)")).toHaveValue(/40\.468/);
  await expect(total).toHaveText("$51,500.00");
  await page.getByRole("button", { name: "U.S. customary units" }).click();
  await expect(page.getByLabel("Field area (ac)")).toHaveValue("100");
  await expect(total).toHaveText("$51,500.00");
});

test("uses the boundary acreage for both the total and saved-plan area label in U.S. units", async ({ page }) => {
  const north = field("field-a", "North field", -99.01);
  const boundaryArea = analyzeBoundary(north.boundary)?.areaHectares;
  await seedFields(page);
  await page.addInitScript(({ savedAt, areaHa }) => {
    localStorage.setItem("meridian.field-plans.v2", JSON.stringify({
      "field-a|wheat": {
        location: { latitude: 38.995, longitude: -99.005, name: "North field", fieldId: "field-a", areaHectares: Number(areaHa) },
        crop: "wheat", coverCrop: "rye", terminationDays: 30, plantingDate: "2027-04-20",
        areaHa, notes: "", savedAt,
      },
    }));
  }, { savedAt: now, areaHa: String(boundaryArea) });
  await page.goto("/economics");
  await page.getByRole("button", { name: "U.S. customary units" }).click();

  const areaInput = page.getByLabel("Field area (ac)");
  await expect(areaInput).toHaveAttribute("readonly", "");
  const acres = Number(await areaInput.inputValue());
  expect(acres).toBeGreaterThan(0);
  const planDescription = page.getByText(/saved plan area/i);
  await expect(planDescription).toContainText("ac");
  await expect(planDescription).not.toContainText("ha");
  const labelledAcres = Number((await planDescription.textContent())?.match(/([\d,.]+) ac/)?.[1].replaceAll(",", ""));
  expect(labelledAcres).toBeCloseTo(acres, 1);
});
