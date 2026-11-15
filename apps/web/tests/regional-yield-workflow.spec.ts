import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const county = JSON.parse(readFileSync("../../shared/payloads/regional-yield-available.json", "utf8"));
const missing = JSON.parse(readFileSync("../../shared/payloads/regional-yield-unavailable.json", "utf8"));

async function base(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#eee"}}] } }));
}

async function researchOptions(page: Page) {
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  await expect(options.getByLabel("Data view", { exact: true })).toHaveValue("research");
  return options;
}

async function openResearch(page: Page) {
  await page.goto("/?view=research&crop=corn&period=2019-2020");
}

async function pickCounty(page: Page) {
  const map = page.locator(".map-canvas");
  await expect(map).toHaveAttribute("data-regional-county-count", "1");
  await expect(map).toHaveAttribute("data-regional-ready", "true");
  const options = await researchOptions(page);
  await options.getByRole("button", { name: "Reset study view", exact: true }).click();
  await page.keyboard.press("Escape");
  const bounds = await map.boundingBox();
  if (!bounds) throw Error("County map unavailable");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.getByRole("region", { name: "Published county estimate details", exact: true })).toBeVisible();
}

test("Explore historical research defaults to sourced county estimates and query filters preserve evidence", async ({ page }) => {
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json:county }));
  await openResearch(page);
  const options = await researchOptions(page);
  const controls = options.getByRole("region", { name: "Historical research controls", exact: true });
  await expect(controls.getByLabel("Research crop", { exact: true })).toHaveValue("corn");
  await expect(controls.getByLabel("Study period", { exact: true })).toHaveValue("2019-2020");
  await expect(controls.getByLabel("County", { exact: true })).toBeVisible();
  await expect(options.getByLabel("Cash crop", { exact: true })).toHaveCount(0);
  await expect(options.getByLabel("Atlas layer", { exact: true })).toHaveCount(0);
  await expect(options.getByLabel("Management scenario", { exact: true })).toHaveCount(0);
  await expect(options.getByText("Net return", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Historical research · Corn · 2019–2020");

  await pickCounty(page);
  const details = page.getByRole("region", { name: "Published county estimate details", exact: true });
  await expect(details).toContainText("Adams, IL");
  await expect(details).toContainText("Estimated yield difference");
  await expect(details).toContainText("−5.38%");
  await expect(details).toContainText("155");
  await expect(details).toContainText("A county aggregate of published sample-level model estimates");
  await expect(page).toHaveURL(/county=17001/);

  const filters = await researchOptions(page);
  await filters.getByLabel("Research crop", { exact: true }).selectOption("soybeans");
  await filters.getByLabel("Study period", { exact: true }).selectOption("2020");
  await expect(page).toHaveURL(/crop=soybeans.*period=2020.*county=17001/);
  await expect(details).toContainText("−5.68%");
  await expect(details).toContainText("73");
  await expect(page.getByRole("region", { name: "Published county yield effect map", exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Historical research · Soybeans · 2020");
});

test("missing crop/year county support stays unavailable rather than becoming zero", async ({ page }) => {
  await base(page);
  const data=structuredClone(county);
  data.regions[0].estimates=data.regions[0].estimates.filter((e:any)=>!(e.crop==="soybeans"&&e.period==="2020"));
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({json:data}));
  await openResearch(page);
  await pickCounty(page);
  const options = await researchOptions(page);
  await options.getByLabel("Research crop", {exact:true}).selectOption("soybeans");
  await options.getByLabel("Study period", {exact:true}).selectOption("2020");
  await expect(page.getByRole("region",{name:"Published county estimate details",exact:true})).toContainText("No estimate for this crop/period. Missing estimates are not zero.");
});

test("research coverage is described at a saved field sample point without changing its planning context", async ({ page }) => {
  await base(page);
  await page.addInitScript(({ longitude, latitude }) => {
    const now = new Date().toISOString();
    const field = { id: "study-field", name: "Adams field", location: { latitude, longitude }, currentCrop: "corn", cropSource: "manual", createdAt: now, updatedAt: now };
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: field.id, fields: [field] }));
  }, { longitude: county.regions[0].centroid[0], latitude: county.regions[0].centroid[1] });
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json:county }));
  await page.goto("/?view=research&crop=soybeans&period=2020");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").selection);
  const options = await researchOptions(page);
  const controls = options.getByRole("region", { name: "Historical research controls", exact: true });
  await expect(controls).toContainText("Study records are available at your field's sample location for corn, 2020");
  await expect(controls).toContainText("This is sample-point overlap, not whole-field coverage.");
  await controls.getByLabel("County", { exact: true }).selectOption("17001");
  await expect(page).toHaveURL(/county=17001/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").selection)).toEqual(original);
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Historical research · Soybeans · 2020");
});

test("network failure uses the actual bundled regional snapshot with source disclosure", async ({ page }) => {
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route=>route.abort());
  await openResearch(page);
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count","486",{timeout:30000});
  const options = await researchOptions(page);
  await expect(options.getByRole("region",{name:"Historical research controls",exact:true})).toContainText("Retry study data");
  await expect(options.getByRole("region",{name:"Historical research controls",exact:true})).toContainText("bundled published study copy");
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Bundled study copy");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-ready","true");
});

test("an explicit API unavailable result does not silently substitute fallback data", async ({ page }) => {
  await base(page);
  let fallbackRequests=0;
  await page.route("**/api/v1/atlas/regional-yield",route=>route.fulfill({json:missing}));
  await page.route("**/data/regional-yield.json", route=>{fallbackRequests++;return route.abort();});
  await openResearch(page);
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Data unavailable");
  const options = await researchOptions(page);
  await expect(options.getByRole("region",{name:"Historical research controls",exact:true}).getByRole("button",{name:"Retry study data",exact:true})).toBeVisible();
  expect(fallbackRequests).toBe(0);
});

test("county evidence opens in the phone information sheet without H3 precision claims", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({json:county}));
  await openResearch(page);
  await pickCounty(page);
  const detail=page.getByRole("region",{name:"Published county estimate details",exact:true});
  await expect(detail).toContainText("Adams, IL");
  await expect(detail).toContainText("Estimated yield difference");
  await expect(detail).toContainText("155");
  await expect(page.getByText("Full hexagon area",{exact:true})).toHaveCount(0);
  const sheet = page.getByRole("dialog", { name: "Historical research information", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Published county estimate details", exact: true })).toContainText("Adams, IL");
});

test("oversized or malformed API data is withheld without switching to the bundled snapshot", async ({ page }) => {
  await base(page);
  let fallbackRequests=0;
  await page.route("**/data/regional-yield.json",route=>{fallbackRequests++;return route.abort();});
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({body:JSON.stringify(county),headers:{"content-type":"application/json","content-length":"20000000"}}));
  await openResearch(page);
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Data unavailable");
  const options = await researchOptions(page);
  await expect(options.getByRole("region",{name:"Historical research controls",exact:true}).getByRole("button",{name:"Retry study data",exact:true})).toBeVisible();
  expect(fallbackRequests).toBe(0);
  const malformed=structuredClone(county);malformed.regions[0].fips=17001;
  await page.route("**/api/v1/atlas/regional-yield",route=>route.fulfill({json:malformed}));
  await options.getByRole("button",{name:"Retry study data",exact:true}).click();
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Data unavailable");
  expect(fallbackRequests).toBe(0);
});

test("a stalled API times out and loads the disclosed real snapshot", async ({ page }) => {
  await base(page);
  await page.clock.install();
  await page.route("**/api/v1/atlas/regional-yield",()=>{});
  await openResearch(page);
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Loading estimates");
  await page.clock.fastForward(12500);
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count","486",{timeout:15000});
  await expect(page.getByRole("contentinfo", { name: "Historical research map legend", exact: true })).toContainText("Bundled study copy");
});
