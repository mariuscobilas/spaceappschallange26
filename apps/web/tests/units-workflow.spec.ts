import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();

function field(id: string, name: string, west: number) {
  const east = west + 0.01;
  return {
    id,
    name,
    location: { latitude: 38.99, longitude: west },
    boundary: {
      type: "Polygon" as const,
      coordinates: [[[west, 38.99], [east, 38.99], [east, 39], [west, 39], [west, 38.99]]],
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

test("keeps economics drafts isolated by field and unit switches leave canonical values and results unchanged", async ({ page }) => {
  await seedFields(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Economics", exact: true }).click();

  await page.getByLabel("Grain price (USD/tonne)").fill("201.123456789");
  await page.getByLabel("Baseline yield (tonnes/ha)").fill("7.25");
  await page.getByLabel("Assumed yield change (%)").fill("5");
  await page.getByLabel("Seed cost (USD/ha)").fill("34");
  await page.getByLabel("Termination cost (USD/ha)").fill("18");
  await page.getByLabel("Subsidy (USD/ha)").fill("6");
  await expect(page.getByText("Total for", { exact: false })).toBeVisible();
  const parcelTotal = page.getByText(/^Total for /).locator("..").locator("p").last();
  const total = await parcelTotal.textContent();
  const before = await page.evaluate(() => localStorage.getItem("meridian.economics.v2"));

  await page.getByLabel("Field or location").selectOption("field:field-b");
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("");
  await expect(page.getByLabel("Baseline yield (tonnes/ha)")).toHaveValue("");
  await page.getByLabel("Field or location").selectOption("field:field-a");
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("201.123456789");

  await page.getByRole("button", { name: "U.S. customary units" }).click();
  await expect(page.getByLabel("Grain price (USD/bu)")).toHaveValue(/\d/);
  await expect(parcelTotal).toHaveText(total!);
  const perAcre = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format((201.123456789 * 7.25 * .05 - 34 - 18 + 6) / 2.4710538147);
  await expect(page.getByText("Net change per acre", { exact: true }).locator("..")).toContainText(perAcre);
  await page.getByRole("button", { name: "Metric units" }).click();
  await expect(page.getByLabel("Grain price (USD/tonne)")).toHaveValue("201.123456789");
  const after = await page.evaluate(() => localStorage.getItem("meridian.economics.v2"));
  expect(after).toBe(before);
  await expect(parcelTotal).toHaveText(total!);
});

test("shows per-area economics before acreage and withholds only the parcel total", async ({ page }) => {
  await page.goto("/economics");
  for (const [label, value] of [["Grain price", "100"], ["Baseline yield", "1"], ["Assumed yield change", "0"], ["Seed cost", "10"], ["Termination cost", "5"], ["Subsidy", "0"]]) {
    await page.getByLabel(label).fill(value);
  }
  await expect(page.getByText("Net change per hectare", { exact: true }).locator("..")).toContainText("-$15.00");
  await expect(page.getByText("Enter a valid field area", { exact: true })).toBeVisible();
  await page.getByLabel("Field area (ha)").fill("2");
  await expect(page.getByText(/^Total for /).locator("..")).toContainText("-$30.00");
});
