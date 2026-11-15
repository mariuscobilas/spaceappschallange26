import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const county = JSON.parse(readFileSync("../../shared/payloads/regional-yield-available.json", "utf8"));
const missing = JSON.parse(readFileSync("../../shared/payloads/regional-yield-unavailable.json", "utf8"));
async function base(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#eee"}}] } }));
}
async function pickCounty(page: Page) {
  await page.getByRole("button", { name:"Fit study area", exact:true }).click();
  const map = page.locator(".map-canvas");
  await expect(map).toHaveAttribute("data-regional-county-count", "1");
  await expect(map).toHaveAttribute("data-regional-ready", "true");
  const b = await map.boundingBox(); if (!b) throw Error("County map unavailable");
  await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  await expect(page.getByRole("region", { name:"Published county estimate details",exact:true })).toBeVisible();
}

test("Atlas defaults to sourced county estimates and filters preserve the correct study evidence", async ({ page }) => {
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json:county }));
  await page.goto("/atlas");
  await expect(page.getByLabel("Atlas layer", {exact:true})).toHaveValue("yield");
  await expect(page.getByLabel("Field or location",{exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Regional study area",{exact:true})).toContainText("Corn Belt");
  await expect(page.getByLabel("Cash crop", {exact:true})).toHaveCount(0);
  await pickCounty(page);
  const detail=page.getByRole("region", { name:"Published county estimate details",exact:true });
  await expect(detail).toContainText("Adams, IL");
  await expect(detail).toContainText("-5.38%");
  await expect(detail).toContainText("155");
  await page.getByLabel("Published crop", {exact:true}).selectOption("soybeans");
  await page.getByLabel("Study period", {exact:true}).selectOption("2020");
  await expect(detail).toContainText("-5.68%");
  await expect(detail).toContainText("73");
  await expect(page.getByRole("region", {name:"Published county yield effect map",exact:true})).toBeVisible();
  await page.getByLabel("Atlas layer", {exact:true}).selectOption("returns");
  await expect(page.getByLabel("Management scenario",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Cash crop",{exact:true})).toBeVisible();
  await page.getByLabel("Atlas layer",{exact:true}).selectOption("yield");
  await expect(page.getByLabel("Published crop",{exact:true})).toHaveValue("soybeans");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count","1");
});

test("missing crop/year county support stays unavailable rather than becoming zero", async ({ page }) => {
  await base(page);
  const data=structuredClone(county);
  data.regions[0].estimates=data.regions[0].estimates.filter((e:any)=>!(e.crop==="soybeans"&&e.period==="2020"));
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({json:data}));
  await page.goto("/atlas");
  await pickCounty(page);
  await page.getByLabel("Published crop",{exact:true}).selectOption("soybeans");
  await page.getByLabel("Study period",{exact:true}).selectOption("2020");
  await expect(page.getByRole("region",{name:"Published county estimate details",exact:true})).toContainText("No published soybeans estimate for 2020");
});

test("network failure uses the actual bundled regional snapshot with source disclosure", async ({ page }) => {
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route=>route.abort());
  await page.goto("/atlas");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count","486",{timeout:30000});
  await expect(page.getByText(/local published copy/)).toBeVisible();
  await expect(page.getByRole("region",{name:"Published county yield controls",exact:true})).toContainText("466");
});

test("an explicit API unavailable result does not silently substitute fallback data", async ({ page }) => {
  await base(page);
  let fallbackRequests=0;
  await page.route("**/api/v1/atlas/regional-yield",route=>route.fulfill({json:missing}));
  await page.route("**/data/regional-yield.json", route=>{fallbackRequests++;return route.abort();});
  await page.goto("/atlas");
  await expect(page.getByRole("region",{name:"Published county yield controls",exact:true})).toContainText(missing.message);
  expect(fallbackRequests).toBe(0);
});

test("county evidence opens in the phone detail sheet without H3 precision claims", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await base(page);
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({json:county}));
  await page.goto("/atlas");
  await pickCounty(page);
  const detail=page.getByRole("region",{name:"Published county estimate details",exact:true});
  await expect(detail).toContainText("Adams, IL");
  await expect(detail).toContainText("155");
  await expect(page.getByText("Full hexagon area",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("oversized or malformed API data is withheld without switching to the bundled snapshot", async ({ page }) => {
  await base(page);
  let fallbackRequests=0;
  await page.route("**/data/regional-yield.json",route=>{fallbackRequests++;return route.abort();});
  await page.route("**/api/v1/atlas/regional-yield", route=>route.fulfill({body:JSON.stringify(county),headers:{"content-type":"application/json","content-length":"20000000"}}));
  await page.goto("/atlas");
  await expect(page.getByRole("region",{name:"Published county yield controls",exact:true})).toContainText("10 MB");
  expect(fallbackRequests).toBe(0);
  const malformed=structuredClone(county);malformed.regions[0].fips=17001;
  await page.route("**/api/v1/atlas/regional-yield",route=>route.fulfill({json:malformed}));
  await page.getByRole("button",{name:"Refresh published data",exact:true}).click();
  await expect(page.getByRole("region",{name:"Published county yield controls",exact:true})).toContainText("failed contract validation");
  expect(fallbackRequests).toBe(0);
});

test("a stalled API times out and loads the disclosed real snapshot", async ({ page }) => {
  await base(page);
  await page.clock.install();
  await page.route("**/api/v1/atlas/regional-yield",()=>{});
  await page.goto("/atlas");
  await expect(page.getByRole("region",{name:"Published county yield controls",exact:true})).toContainText("Loading published county estimates");
  await page.clock.fastForward(12500);
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-regional-county-count","486",{timeout:15000});
  await expect(page.getByText(/local published copy/)).toBeVisible();
});
