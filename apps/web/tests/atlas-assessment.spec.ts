import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const county = JSON.parse(readFileSync("../../shared/payloads/regional-yield-available.json", "utf8"));
const unavailable = JSON.parse(readFileSync("../../shared/payloads/regional-yield-unavailable.json", "utf8"));

async function openMapOptions(page: Page) {
  const options = page.getByRole("dialog", { name: "Map options" });
  if (!(await options.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Map options", exact: true }).click();
  }
  await expect(options).toBeVisible();
}

async function enterResearch(page: Page, payload: unknown = county) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json: payload }));
  await page.goto("/");
  await openMapOptions(page);
  await page.getByLabel("Data view", { exact: true }).selectOption("research");
  await openMapOptions(page);
  await expect(page.getByLabel("Research crop", { exact: true })).toHaveValue("corn");
}

async function inspectCounty(page: Page, fips = "17001") {
  await page.getByLabel("County", { exact: true }).selectOption(fips);
  await page.getByRole("button", { name: "Inspect selected county", exact: true }).click();
  return page.getByRole("complementary", { name: "Region overview", exact: true });
}

test("historical research renders a county estimate with source details and the persistent legend", async ({ page }) => {
  await enterResearch(page);
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-ready", "true");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count", "1");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend" })).toContainText("Historical research · Corn · 2019–2020");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend" })).toContainText("Lower");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend" })).toContainText("No estimate");

  const details = await inspectCounty(page);
  await expect(details).toContainText("Adams, IL");
  await expect(details).toContainText("Estimated yield difference");
  await expect(details).toContainText("−5.38%");
  await expect(details).toContainText("2019 records");
  await expect(details).toContainText("70");
  await expect(details).toContainText("2020 records");
  await expect(details).toContainText("85");
  await expect(details).toContainText("not a county-wide measured yield");

  const disclosure = details.locator("details");
  await expect(disclosure.getByText(/archive SHA-256/)).toBeHidden();
  await disclosure.locator("summary").click();
  await expect(disclosure.getByText(/archive SHA-256/)).toContainText("619c191f");
  await expect(disclosure.getByRole("link", { name: /Deines et al\./ })).toHaveAttribute("href", "https://doi.org/10.5281/zenodo.7199708");
});

test("study loading and explicit unavailability have distinct research controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  const stalled = () => {};
  await page.route("**/api/v1/atlas/regional-yield", stalled);
  await page.goto("/?view=research");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend" })).toContainText("Loading estimates");
  await openMapOptions(page);
  await expect(page.getByLabel("County", { exact: true })).toBeDisabled();

  await page.unroute("**/api/v1/atlas/regional-yield", stalled);
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ status: 503, json: unavailable }));
  await page.reload();
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend" })).toContainText("Data unavailable");
  await openMapOptions(page);
  await expect(page.getByRole("button", { name: "Retry study data", exact: true })).toBeVisible();
  await expect(page.getByLabel("County", { exact: true })).toBeDisabled();
});

test("a missing crop-period estimate stays explicitly unavailable rather than becoming zero", async ({ page }) => {
  const data = structuredClone(county);
  data.regions[0].estimates = data.regions[0].estimates.filter((estimate: { crop: string; period: string }) => !(estimate.crop === "soybeans" && estimate.period === "2020"));
  await enterResearch(page, data);
  await page.getByLabel("Research crop", { exact: true }).selectOption("soybeans");
  await page.getByLabel("Study period", { exact: true }).selectOption("2020");
  const details = await inspectCounty(page);
  await expect(details).toContainText("No estimate for this crop/period");
  await expect(details).toContainText("Missing estimates are not zero");
  await expect(details).not.toContainText("0.00%");
});
