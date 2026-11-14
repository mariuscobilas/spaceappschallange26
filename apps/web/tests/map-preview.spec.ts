import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("one modern workspace preserves crop and historical period", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Cash crop").selectOption("corn");
  await page.getByLabel("Observation period").selectOption("past");
  await page.getByLabel("Observation date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Benchmark location").selectOption("hays");
  await page
    .getByRole("button", { name: "National Risk Atlas", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Cash crop")).toHaveValue("corn");
  await expect(page.getByLabel("Observation period")).toHaveValue("past");
  await expect(
    page.getByLabel("Observation date", { exact: true }),
  ).toHaveValue("2026-11-01");
  await expect(page.getByRole("button", { name: /drought/i })).toHaveCount(0);
  await expect(page.getByText(/demo risk/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("old settings migrate without drought or old design", async ({ page }) => {
  let externalRequests = 0;
  page.on("request", (r) => {
    if (/earthdata/.test(r.url())) externalRequests++;
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "meridian.map-settings.v2",
      JSON.stringify({
        mode: "field",
        crop: "corn",
        scenario: "drought",
        overlay: "smap",
        opacity: 0.55,
        selection: {
          name: "Hays",
          latitude: 38.8792,
          longitude: -99.3268,
          benchmarkId: "hays",
        },
      }),
    ),
  );
  await page.goto("/?design=b");
  await expect(page.getByLabel("Cash crop")).toHaveValue("corn");
  await expect(page.getByLabel("Observation period")).toHaveValue("latest");
  await expect(page.getByLabel("Benchmark location")).toHaveValue("hays");
  await expect(page).not.toHaveURL(/design=/);
  expect(externalRequests).toBe(0);
});

test("hex-only geometry is selectable and refines over four zoom levels", async ({
  page,
}) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "National Risk Atlas", exact: true })
    .click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-hex-resolution",
    "2",
    { timeout: 20000 },
  );
  await expect(async () => {
    await page.mouse.click(800, 400);
    await expect(page.getByLabel("Selected location details")).toContainText(
      "Selected region",
    );
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-hex-resolution",
    "3",
  );
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-hex-resolution",
    "4",
  );
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-hex-resolution",
    "5",
    { timeout: 15000 },
  );
  await expect(page.getByLabel("Selected location details")).toContainText(
    "Selected region",
  );
});

test("crop select occupies its complete visible hit area", async ({ page }) => {
  await page.goto("/");
  const select = page.getByLabel("Cash crop");
  await expect(select).toBeVisible();
  expect(
    await select.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + 4, r.right - 4].every(
        (x) => document.elementFromPoint(x, r.top + r.height / 2) === el,
      );
    }),
  ).toBe(true);
  await select.selectOption("corn");
  await expect(select).toHaveValue("corn");
});

test("Intel prepares an honest request with selected context", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Cash crop").selectOption("corn");
  await page
    .getByRole("button", { name: "Ask Meridian Intel", exact: true })
    .click();
  await expect(page.getByLabel("Your question")).toBeVisible();
  await expect(
    page.getByLabel("Meridian Intel", { exact: true }),
  ).toContainText(/not connected|not available|coming soon/i);
  await page
    .getByLabel("Your question")
    .fill("What observations should I review before planting?");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy request", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Request copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Crop: Corn",
  );
});

test("phone and landscape layouts fit without horizontal scrolling", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByLabel("Observation period")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Field Simulator", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("historical satellite dates resolve before requested date and latest uses advertised default", async ({
  page,
}) => {
  const ids = [
    "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    "VIIRS_NOAA20_NDVI_8Day",
    "IMERG_Precipitation_Rate",
  ];
  const xml =
    '<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"><Contents>' +
    ids
      .map(
        (id) =>
          `<Layer><ows:Identifier>${id}</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-11-13</Default><Value>2026-11-01/2026-11-13/P8D</Value></Dimension></Layer>`,
      )
      .join("") +
    "</Contents></Capabilities>";
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    if (/GetCapabilities/i.test(route.request().url()))
      return route.fulfill({ contentType: "application/xml", body: xml });
    if (route.request().url().endsWith(".png"))
      return route.fulfill({
        contentType: "image/png",
        body: readFileSync("tests/fixtures/overlay.png"),
      });
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="10"/>',
    });
  });
  await page.goto("/");
  await page.getByLabel("Observation period").selectOption("past");
  await page.getByLabel("Observation date", { exact: true }).fill("2026-11-10");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "Vegetation · NDVI", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("2026-11-09", {
    timeout: 20000,
  });
  await page.getByLabel("Observation period").selectOption("latest");
  await expect(page.getByRole("status")).toContainText("2026-11-13", {
    timeout: 15000,
  });
});
