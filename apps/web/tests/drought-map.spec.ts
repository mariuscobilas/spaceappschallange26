import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const metadata = () => JSON.parse(readFileSync("data/usdm.json", "utf8"));
const style = { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#eee" } }] };

test("bundled official drought snapshot matches its provenance and contains finite geographic polygons", () => {
  const meta = metadata();
  const bytes = readFileSync(`public/data/usdm-${meta.asOf}.geojson`);
  expect(bytes.length).toBeLessThan(2_000_000);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(meta.sha256);
  expect(meta.sourceUrl).toBe(`https://droughtmonitor.unl.edu/data/json/usdm_${meta.asOf.replaceAll("-", "")}.json`);
  const data = JSON.parse(bytes.toString());
  expect(data.features.map((f: any) => f.properties.DM).sort()).toEqual([0,1,2,3,4]);
  function coordinates(value: any): boolean {
    if (typeof value[0] === "number") {
      return Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
    } else return value.every(coordinates);
  }
  for (const feature of data.features) expect(coordinates(feature.geometry.coordinates)).toBeTruthy();
});

test("drought loads on demand, retries failures, survives map changes and stays separate from Atlas returns", async ({ page }) => {
  let requests = 0;
  let unavailable = true;
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: style }));
  await page.route("**/data/usdm-*.geojson", route => {
    requests++;
    return unavailable ? route.fulfill({ status: 503, body: "unavailable" }) : route.fulfill({ contentType: "application/geo+json", body: readFileSync(`public/data/usdm-${metadata().asOf}.geojson`) });
  });
  await page.goto("/");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-resolution", /\d/, { timeout: 30000 });
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Map options" });
  await dialog.getByRole("checkbox", { name: "U.S. Drought Monitor", exact: true }).check();
  await expect(dialog.getByText("Drought overlay unavailable. Other map layers remain usable.")).toBeVisible();
  unavailable = false;
  await dialog.getByRole("button", { name: "Retry drought overlay" }).click();
  await expect(canvas).toHaveAttribute("data-drought-status", "ready");
  await expect(dialog.getByRole("list", { name: "Drought legend" })).toBeVisible();
  await dialog.getByLabel("Base map", { exact: true }).selectOption("dark");
  await expect(canvas).toHaveAttribute("data-drought-status", "ready");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(canvas).toHaveAttribute("data-drought-status", "ready");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await dialog.getByLabel("Data view", { exact: true }).selectOption("research");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-drought-status", "off");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await dialog.getByLabel("Data view", { exact: true }).selectOption("conditions");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-drought-status", "ready");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "U.S. Drought Monitor", exact: true }).uncheck();
  await expect(canvas).toHaveAttribute("data-drought-status", "off");
});
