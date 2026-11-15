import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const style = {
  version: 8,
  sources: {},
  layers: [{ id: "basemap-background", type: "background", paint: { "background-color": "#f3f3f1" } }],
};
const transparentPng = readFileSync("tests/fixtures/overlay.png");

async function mockOpenFreeMap(page: Page) {
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ json: style }));
}

async function openOptions(page: Page) {
  await page.getByRole("button", { name: "Map options" }).click();
  await expect(page.getByRole("dialog", { name: "Map options" })).toBeVisible();
}

test("base map selection persists across reload and requests the USGS topo tile service", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOpenFreeMap(page);
  const tiles: string[] = [];
  await page.route("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/**", async (route) => {
    tiles.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
  });
  await page.goto("/");
  await expect(page.locator(".map-canvas")).toBeVisible();
  await openOptions(page);
  await page.getByLabel("Base map").selectOption("usgs-topo");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles[0]).toContain("USGSTopo/MapServer/tile/");
  expect(tiles[0]).toMatch(/\/tile\/\d+\/\d+\/\d+$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  expect(saved.basemap).toBe("usgs-topo");

  await page.reload();
  await expect(page.locator(".map-canvas")).toBeVisible();
  await openOptions(page);
  await expect(page.getByLabel("Base map")).toHaveValue("usgs-topo");
});

test("USGS aerial imagery requests the imagery-only service and identifies its dated imagery as not live", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOpenFreeMap(page);
  const tiles: string[] = [];
  await page.route("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/**", async (route) => {
    tiles.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
  });
  await page.goto("/");
  await openOptions(page);
  await page.getByLabel("Base map").selectOption("usgs-imagery");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  await expect(page.getByText(/imagery is not live/i)).toBeVisible();
  expect(tiles[0]).toContain("USGSImageryOnly/MapServer/tile/");
});

test("keeps in-progress vertices intact and preserves a boundary draft across a base map switch", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOpenFreeMap(page);
  await page.route("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: transparentPng }));
  await page.goto("/fields");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-count", /\d+/);
  for (let index = 0; index < 7; index++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Draw boundary" }).click();
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  const centerX = bounds.x + bounds.width * 0.43;
  const centerY = bounds.y + bounds.height * 0.42;
  for (const [x, y] of [[-40, -40], [40, -40], [40, 40], [-40, 40]]) {
    await page.mouse.click(centerX + x, centerY + y);
  }
  await openOptions(page);
  await expect(page.getByLabel("Base map")).toBeDisabled();
  await expect(page.getByText("Finish or cancel boundary drawing before changing the base map. Your in-progress vertices stay in place.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Finish boundary" }).click();
  const initialDetails = page.getByRole("dialog", { name: "Field details" });
  await expect(initialDetails).toBeVisible();
  await expect(initialDetails.getByText("Geodesic field area")).toBeVisible();
  await initialDetails.getByRole("button", { name: "Edit boundary" }).click();
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true");
  await openOptions(page);
  await page.getByLabel("Base map").selectOption("usgs-topo");
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true", { timeout: 15000 });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Finish boundary" }).click();
  const details = page.getByRole("dialog", { name: "Field details" });
  await expect(details).toBeVisible();
  await expect(details.getByText("Geodesic field area")).toBeVisible();
  await expect(details.getByText(/\d+\.\d+ ha/)).toBeVisible();
});

test("defers basemap failure fallback until an active polygon is finished", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOpenFreeMap(page);
  let failNewTiles = false;
  let topoRequests = 0;
  await page.route("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/**", (route) => {
    topoRequests++;
    return failNewTiles ? route.abort() : route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
  });
  await page.goto("/fields");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-count", /\d+/);
  await openOptions(page);
  await page.getByLabel("Base map").selectOption("usgs-topo");
  await expect.poll(() => topoRequests).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close" }).click();
  for (let index = 0; index < 7; index++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Draw boundary" }).click();
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  const centerX = bounds.x + bounds.width * 0.43;
  const centerY = bounds.y + bounds.height * 0.42;
  for (const [x, y] of [[-35, -35], [35, -35], [35, 35], [-35, 35]]) await page.mouse.click(centerX + x, centerY + y);
  const beforeFailure = topoRequests;
  failNewTiles = true;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => topoRequests).toBeGreaterThan(beforeFailure);
  await openOptions(page);
  await expect(page.getByRole("status").filter({ hasText: "current map stays visible until boundary drawing is finished or canceled" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Base map")).toBeDisabled();
  await expect(canvas).toHaveAttribute("data-drawing-ready", "true");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Finish boundary" }).click();
  const details = page.getByRole("dialog", { name: "Field details" });
  await expect(details).toBeVisible();
  await expect(details.getByText("Geodesic field area")).toBeVisible();
  await page.keyboard.press("Escape");
  await openOptions(page);
  await expect(page.getByRole("status").filter({ hasText: "The local fallback map is shown" })).toBeVisible({ timeout: 15000 });
});

test("failed provider falls back without changing location and recovers on retry", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOpenFreeMap(page);
  let requests = 0;
  await page.route("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/**", (route) => {
    requests++;
    return requests <= 1 ? route.abort() : route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
  });
  await page.goto("/");
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-count", /\d+/);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  await openOptions(page);
  await page.getByLabel("Base map").selectOption("usgs-topo");
  await expect(page.getByRole("status").filter({ hasText: "Selected basemap is unavailable" })).toBeVisible({ timeout: 15000 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  expect(after.basemap).toBe("usgs-topo");
  expect(after.selection).toEqual(before.selection);
  const requestsBeforeRetry = requests;
  await page.getByRole("button", { name: "Retry base map" }).click();
  await expect.poll(() => requests).toBeGreaterThan(requestsBeforeRetry);
  await expect(page.getByRole("status").filter({ hasText: "Selected basemap is unavailable" })).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-hex-count", /\d+/);
});
