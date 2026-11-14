import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cellArea, cellToLatLng, getResolution, UNITS } from "h3-js";

test("Explore aligns input and button centres with latest and past date controls", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  const controls = [
    page.getByRole("button", { name: "Toggle navigation", exact: true }),
    page.getByLabel("Field or location"), page.getByLabel("Cash crop", { exact: true }),
    page.getByRole("button", { name: "Field Simulator", exact: true }),
    page.getByRole("button", { name: "Draw boundary", exact: true }),
    page.getByRole("button", { name: "Layers", exact: true }),
    page.getByLabel("Observation period"),
    page.getByRole("button", { name: "Selected location details", exact: true }),
  ];
  await expect(controls[1]).toBeEnabled();
  for (const mode of ["latest", "past"]) {
    await page.getByLabel("Observation period").selectOption(mode);
    const all = mode === "past" ? [...controls, page.getByLabel("Observation date", { exact: true })] : controls;
    const centres = await Promise.all(all.map(async (control) => {
      const box = await control.boundingBox();
      if (!box) throw Error("Toolbar control is not visible");
      return box.y + box.height / 2;
    }));
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Observation date", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("Atlas has a docked overview with real hex geometry and clearly identified centre samples", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  const example = JSON.parse(readFileSync("../../shared/payloads/field-conditions-available.json", "utf8"));
  await page.route("**/api/v1/field-conditions?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const response = structuredClone(example);
    response.sample = { latitude: Number(query.get("latitude")), longitude: Number(query.get("longitude")) };
    response.requestedDate = query.get("as_of");
    return route.fulfill({ json: response });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "National Risk Atlas", exact: true }).click();
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-resolution", "2", { timeout: 30000 });
  await expect(async () => {
    await page.mouse.click(800, 400);
    await expect(page.getByRole("complementary", { name: "Region overview" })).toBeVisible();
  }).toPass({ timeout: 15000 });
  const panel = page.getByRole("complementary", { name: "Region overview" });
  const selected = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").selection);
  const [latitude, longitude] = cellToLatLng(selected.hexId);
  expect(selected.latitude).toBeCloseTo(latitude, 8);
  expect(selected.longitude).toBeCloseTo(longitude, 8);
  await expect(panel).toContainText(`H3 resolution ${getResolution(selected.hexId)}`);
  await expect(panel).toContainText(new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(cellArea(selected.hexId, UNITS.km2)) + " km²");
  await expect(panel.getByText("Conditions at the centre", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Root-zone wetness: 42%")).toBeVisible();
  await expect(panel).toContainText("not averages across this hexagon");
  const mapBounds = await canvas.boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(mapBounds!.x + mapBounds!.width).toBeLessThanOrEqual(panelBounds!.x + 1);
  const resolution = await canvas.getAttribute("data-hex-resolution");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-hex-resolution", resolution!);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`H3 resolution ${getResolution(selected.hexId)}`);
  const resizedMap = await canvas.boundingBox();
  await page.mouse.click(resizedMap!.x + resizedMap!.width * .3, resizedMap!.y + resizedMap!.height * .3);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").selection.hexId)).not.toBe(selected.hexId);
  const nextSelection = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").selection);
  await expect(panel).toContainText(nextSelection.hexId);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("dialog", { name: nextSelection.name });
  await expect(mobile).toBeVisible();
  await expect(mobile).toContainText("Region at a glance");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await mobile.getByRole("button", { name: "Inspect field here", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Field details", exact: true })).toBeVisible();
});
