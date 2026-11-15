import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const countyStudy = JSON.parse(readFileSync("public/data/regional-yield.json", "utf8"));

test("records county filter update and software-rendered map frame timing", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("**/api/v1/atlas/regional-yield", route => route.fulfill({ json: countyStudy }));
  await page.goto("/?view=research");
  const map = page.locator(".map-canvas");
  await expect(map).toHaveAttribute("data-regional-county-count", String(countyStudy.regions.length), { timeout: 60000 });
  await page.getByRole("button", { name: "Map options", exact: true }).click();

  const measureFilter = async (label: string, value: string, attribute: string, expected: string) => {
    await page.evaluate(() => { (window as any).__researchFilterStart = performance.now(); });
    await page.getByLabel(label, { exact: true }).selectOption(value);
    await expect.poll(() => map.getAttribute(attribute), { timeout: 15000 }).toBe(expected);
    return page.evaluate(() => performance.now() - (window as any).__researchFilterStart);
  };
  const cropFilterMs = await measureFilter("Research crop", "soybeans", "data-regional-crop", "soybeans");
  const periodFilterMs = await measureFilter("Study period", "2020", "data-regional-period", "2020");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.evaluate(() => {
    const stamps: number[] = [];
    (window as any).__researchFrames = stamps;
    const start = performance.now();
    const tick = (time: number) => {
      stamps.push(time);
      if (time - start < 1800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Research map bounds unavailable");
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.58, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(1900);

  const frames = await page.evaluate(() => {
    const times = (window as any).__researchFrames as number[];
    const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
    return {
      samples: times.length,
      medianFrameIntervalMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      p95FrameIntervalMs: gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : null,
      observedDurationMs: times.length > 1 ? times[times.length - 1] - times[0] : 0,
    };
  });
  const result = {
    studyCounties: countyStudy.regions.length,
    filters: { cropFilterMs, periodFilterMs },
    viewport: "1440x960",
    environment: "Chromium software rendering (Playwright SwiftShader), development server",
    softwareFrameTiming: frames,
    note: "Software-rendered browser timings are interaction diagnostics, not production GPU throughput or frame-rate claims.",
  };
  console.log(JSON.stringify(result));
  await testInfo.attach("research-map-performance.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  expect(cropFilterMs).toBeLessThan(300);
  expect(periodFilterMs).toBeLessThan(300);
  expect(frames.samples).toBeGreaterThan(0);
});
