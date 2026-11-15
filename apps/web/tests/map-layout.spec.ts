import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const style = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#eee" } }],
};

async function mockMapData(page: Page) {
  const ids = [
    "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    "VIIRS_NOAA20_NDVI_8Day",
    "IMERG_Precipitation_Rate",
  ];
  const xml = '<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"><Contents>' +
    ids.map((id) => `<Layer><ows:Identifier>${id}</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-11-13</Default><Value>2026-11-01/2026-11-13/P8D</Value></Dimension></Layer>`).join("") +
    "</Contents></Capabilities>";
  await page.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: style }));
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const url = route.request().url();
    if (/GetCapabilities/i.test(url)) return route.fulfill({ contentType: "application/xml", body: xml });
    if (url.endsWith(".png")) return route.fulfill({ contentType: "image/png", body: readFileSync("tests/fixtures/overlay.png") });
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="10"/>' });
  });
  await page.route("**/data/usdm-*.geojson", (route) => {
    const metadata = JSON.parse(readFileSync("data/usdm.json", "utf8"));
    return route.fulfill({ contentType: "application/geo+json", body: readFileSync(`public/data/usdm-${metadata.asOf}.geojson`) });
  });
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "control should have a visible hit area").not.toBeNull();
  expect(box!.height, "touch target should be at least 44 CSS pixels high").toBeGreaterThanOrEqual(44);
  expect(box!.width, "touch target should be at least 44 CSS pixels wide").toBeGreaterThanOrEqual(44);
}

async function startDrawing(page: Page) {
  await page.goto("/fields");
  const toolbar = page.locator('header[aria-label="Map toolbar"]');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "Back to Field Planner", exact: true })).toBeVisible();
  const mapOptionsButton = toolbar.getByRole("button", { name: "Map options", exact: true });
  await expect(mapOptionsButton).toHaveCount(1);
  await expectTouchTarget(mapOptionsButton);
  if ((page.viewportSize()?.width ?? 1440) < 640) {
    const fieldsButton = toolbar.getByRole("button", { name: /^My fields \(\d+\)$/ });
    await expectTouchTarget(fieldsButton);
    await fieldsButton.click();
    await page.getByRole("dialog", { name: "My fields", exact: true }).getByRole("button", { name: "Draw boundary", exact: true }).click();
  } else {
  await page.getByRole("button", { name: "Draw boundary", exact: true }).click();
  }
  const actions = page.getByRole("group", { name: "Boundary drawing actions", exact: true });
  await expect(actions).toBeVisible();
  await expect(page.getByText(/Click to add vertices\./)).toBeVisible({ timeout: 20000 });
  return actions;
}

async function enableVegetationAndDrought(page: Page) {
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  await options.getByRole("checkbox", { name: "U.S. Drought Monitor", exact: true }).check();
  await options.getByRole("button", { name: "Vegetation · NDVI", exact: true }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-drought-status", "ready", { timeout: 30000 });
  await options.getByRole("button", { name: "Close", exact: true }).click();
}

test("desktop drawing has one instruction, clears an old discard notice, and keeps controls clear of the map status footer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockMapData(page);
  const actions = await startDrawing(page);

  await expect(page.getByText(/Click to add vertices\./)).toHaveCount(1);
  await expect(page.getByRole("note").filter({ hasText: /Click to add vertices\./ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select point", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Draw boundary", exact: true })).toHaveCount(0);
  await expectTouchTarget(actions.getByRole("button", { name: "Finish boundary", exact: true }));
  await expectTouchTarget(actions.getByRole("button", { name: "Cancel drawing", exact: true }));

  await actions.getByRole("button", { name: "Cancel drawing", exact: true }).click();
  const staleNotice = page.getByRole("status").filter({ hasText: "Unsaved field changes were discarded." });
  await expect(staleNotice).toBeVisible();
  await page.getByRole("button", { name: "Draw boundary", exact: true }).click();
  await expect(page.getByRole("group", { name: "Boundary drawing actions", exact: true })).toBeVisible();
  await expect(staleNotice).toHaveCount(0);
  await enableVegetationAndDrought(page);

  const mapViewport = page.getByRole("region", { name: "Interactive field map", exact: true });
  const statusFooter = page.locator("footer").filter({ has: page.getByRole("status", { name: "Map data status", exact: true }) });
  await expect(statusFooter).toBeVisible();
  const viewportBox = await mapViewport.boundingBox();
  const footerBox = await statusFooter.boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThanOrEqual(viewportBox!.y + viewportBox!.height - 1);
  const attribution = page.locator(".maplibregl-ctrl-attrib").first();
  await expect(attribution).toBeVisible();
  const attributionBox = await attribution.boundingBox();
  expect(attributionBox).not.toBeNull();
  expect(attributionBox!.y + attributionBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height + 1);
  expect(attributionBox!.y + attributionBox!.height).toBeLessThan(footerBox!.y + 1);
});

test("mobile drawing preserves a usable map, 44px controls, and a single non-overlapping vegetation and drought status footer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapData(page);
  const actions = await startDrawing(page);
  await expect(page.getByText(/Click to add vertices\./)).toHaveCount(1);
  await expect(page.getByRole("note").filter({ hasText: /Click to add vertices\./ })).toHaveCount(0);
  await expectTouchTarget(actions.getByRole("button", { name: "Finish boundary", exact: true }));
  await expectTouchTarget(actions.getByRole("button", { name: "Cancel drawing", exact: true }));

  const mapViewport = page.getByRole("region", { name: "Interactive field map", exact: true });
  const viewportBox = await mapViewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(viewportBox!.height, "phone map stays usable while drawing").toBeGreaterThanOrEqual(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await actions.getByRole("button", { name: "Cancel drawing", exact: true }).click();

  await page.goto("/");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-resolution", /\d/, { timeout: 30000 });
  await enableVegetationAndDrought(page);

  const status = page.getByRole("status", { name: "Map data status", exact: true });
  await expect(status).toContainText("Vegetation");
  await expect(status).toContainText("NASA GIBS");
  await expect(status).toContainText("U.S. Drought Monitor");
  await expect(page.getByRole("status").filter({ hasText: "U.S. Drought Monitor" })).toHaveCount(1);
  const viewport = page.getByRole("region", { name: "Interactive field map", exact: true });
  const footer = page.locator("footer").filter({ has: status });
  const viewportBounds = await viewport.boundingBox();
  const footerBounds = await footer.boundingBox();
  expect(viewportBounds).not.toBeNull();
  expect(footerBounds).not.toBeNull();
  expect(footerBounds!.y).toBeGreaterThanOrEqual(viewportBounds!.y + viewportBounds!.height - 1);
  const attribution = page.locator(".maplibregl-ctrl-attrib").first();
  await expect(attribution).toBeVisible();
  const attributionBounds = await attribution.boundingBox();
  expect(attributionBounds).not.toBeNull();
  expect(attributionBounds!.y + attributionBounds!.height).toBeLessThanOrEqual(viewportBounds!.y + viewportBounds!.height + 1);
  expect(attributionBounds!.y + attributionBounds!.height).toBeLessThan(footerBounds!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
