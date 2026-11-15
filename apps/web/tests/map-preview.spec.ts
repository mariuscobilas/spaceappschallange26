import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

async function openMapOptions(page: import("@playwright/test").Page) {
  const sheet = page.getByRole("dialog", { name: "Map options" });
  if (!(await sheet.isVisible().catch(() => false)))
    await page.getByRole("button", { name: "Map options", exact: true }).click();
  await expect(sheet).toBeVisible();
}

async function closeMapOptions(page: import("@playwright/test").Page) {
  const sheet = page.getByRole("dialog", { name: "Map options" });
  if (await sheet.isVisible().catch(() => false)) {
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sheet).toBeHidden();
  }
}

async function mockGibs(page: import("@playwright/test").Page) {
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
    const url = route.request().url();
    if (/GetCapabilities/i.test(url))
      return route.fulfill({ contentType: "application/xml", body: xml });
    if (url.endsWith(".png"))
      return route.fulfill({
        contentType: "image/png",
        body: readFileSync("tests/fixtures/overlay.png"),
      });
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="10"/>',
    });
  });
}

test("Explore settings persist across workspace routes, browser history, and reload", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockGibs(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Explore" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const map = page.locator(".workspace-map");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-resolution", /\d/, {
    timeout: 30000,
  });
  await map.evaluate((node) =>
    node.setAttribute("data-test-map-instance", "stable"),
  );

  await openMapOptions(page);
  await expect(page.locator('optgroup[label="Kansas reference locations"]')).toHaveCount(0);
  await page.getByLabel("Observation period").selectOption("past");
  await page.getByLabel("Observation date", { exact: true }).fill("2026-11-01");
  await page
    .getByRole("button", { name: "Soil moisture · SMAP", exact: true })
    .click();
  await closeMapOptions(page);
  await expect(page.getByRole("status")).toContainText("2026-11-01", {
    timeout: 20000,
  });
  await closeMapOptions(page);

  await openMapOptions(page);
  await expect(page.getByLabel("Data view", { exact: true })).toHaveValue("conditions");
  await expect(page.getByLabel("Cash crop", { exact: true })).toHaveCount(0);

  await closeMapOptions(page);
  await page.getByRole("link", { name: "Field Planner" }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("heading", { name: "Add your first field" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Field Planner" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(map).toBeHidden();
  await expect(map).toHaveAttribute("data-test-map-instance", "stable");
  const resolution = await canvas.getAttribute("data-hex-resolution");

  await page.getByRole("link", { name: "Explore" }).click();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-test-map-instance", "stable");
  await expect(canvas).toHaveAttribute("data-hex-resolution", resolution!);
  await openMapOptions(page);
  await expect(page.getByLabel("Field or location")).toHaveCount(0);
  await expect(page.getByLabel("Data view", { exact: true })).toHaveValue("conditions");
  await expect(page.getByLabel("Cash crop", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Observation period")).toHaveValue("past");
  await expect(page.getByLabel("Observation date", { exact: true })).toHaveValue("2026-11-01");
  await closeMapOptions(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(
    page.getByRole("link", { name: "Field Planner" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Add your first field" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await openMapOptions(page);
  await expect(page.getByLabel("Field or location")).toHaveCount(0);
  await expect(page.getByLabel("Data view", { exact: true })).toHaveValue("conditions");
  await expect(page.getByLabel("Cash crop", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Observation period")).toHaveValue("past");
  await expect(
    page.getByLabel("Observation date", { exact: true }),
  ).toHaveValue("2026-11-01");
  await expect(
    page.getByRole("button", { name: "Soil moisture · SMAP", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await closeMapOptions(page);
});

test("mobile navigation opens, routes, and closes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Ask Meridian" }).click();
  await expect(
    page.getByRole("heading", { name: "Ask Meridian" }),
  ).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\/intel$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Explore H3 details can close before zooming", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-hex-resolution", "4", {
    timeout: 30000,
  });
  const details = page.getByRole("dialog", { name: "Hexagon information" });
  await expect(async () => {
    await page.mouse.click(800, 400);
    await expect(details).toBeVisible();
  }).toPass({ timeout: 20000 });
  await expect(details).toContainText("Region at a glance");
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeHidden();

  for (let i = 0; i < 7; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-hex-resolution", "5", { timeout: 15000 });
});

test("field plan inputs save for the selected field and survive reload", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "field-test", fields: [{ id: "field-test", name: "Test field", location: { latitude: 38.99, longitude: -99.01 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] })));
  await page.goto("/planner/calendar");
  await page.getByLabel("Cover crop", { exact: true }).selectOption("pea");
  await page.getByLabel("Cash crop planting date").fill("2027-04-15");
  const extras = page.locator("details").filter({ has: page.locator("summary", { hasText: "Field area and notes" }) });
  await expect(extras.locator("#planner-area")).toBeHidden();
  await extras.locator("summary").click();
  await page.getByLabel("Field area (ha)").fill("12.5");
  await page.getByLabel("Notes").fill("Keep the stand through spring.");
  await page.getByRole("button", { name: "Review calendar only" }).click();
  await expect(page).toHaveURL(/\/planner\/review\?budget=skip$/);
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Plan saved on this device.");

  await page.reload();
  await expect(page).toHaveURL(/\/planner\/review\?budget=skip$/);
  await page.getByRole("button", { name: "Edit calendar" }).click();
  await expect(page.getByLabel("Cover crop", { exact: true })).toHaveValue(
    "pea",
  );
  await expect(page.getByLabel("Cash crop planting date")).toHaveValue(
    "2027-04-15",
  );
  await expect(page.getByLabel("Field area (ha)")).toHaveValue("12.5");
  await expect(page.getByLabel("Notes")).toHaveValue(
    "Keep the stand through spring.",
  );
  await expect(page.getByRole("status")).toContainText("Saved calendar.");

  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByText(/saved plan area 12\.5 ha/i)).toBeVisible();
  await page.getByRole("link", { name: "Ask Meridian", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ask Meridian" }),
  ).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Analysis is not connected yet" })).toBeVisible();
  await page.getByLabel("Your question").fill("What should I review next?");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy request" }).click();
  await expect(page.getByRole("status")).toHaveText("Request copied");
  const request = await page.evaluate(() => navigator.clipboard.readText());
  expect(request).toContain("Crop: Wheat");
  expect(request).toContain("Cover crop: Winter pea");
  expect(request).toContain("Entered field area: 12.5 ha");
});

test("economics inputs produce and persist a transparent scenario", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "field-test", fields: [{ id: "field-test", name: "Test field", location: { latitude: 38.99, longitude: -99.01 }, currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] })));
  await page.goto("/economics");
  const values: Record<string, string> = {
    "Grain price": "200",
    "Baseline yield": "5",
    "Assumed yield change": "10",
    "Seed cost": "30",
    "Termination cost": "20",
    Subsidy: "10",
    "Field area": "4",
  };
  for (const [label, value] of Object.entries(values))
    await page.getByLabel(new RegExp(label)).fill(value);

  await expect(page.getByText("$1,060.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$4,240.00", { exact: true })).toBeVisible();
  await page.reload();
  for (const [label, value] of Object.entries(values))
    await expect(page.getByLabel(new RegExp(label))).toHaveValue(value);
  await expect(page.getByText("$1,060.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$4,240.00", { exact: true })).toBeVisible();
});

test("legacy map settings migrate without old scenarios or external imagery", async ({
  page,
}) => {
  let earthdataRequests = 0;
  page.on("request", (request) => {
    if (/earthdata/i.test(request.url())) earthdataRequests++;
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
  await page.goto("/");
  await openMapOptions(page);
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}"));
  expect(migrated.crop).toBe("corn");
  await expect(page.getByLabel("Cash crop", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Field or location")).toHaveCount(0);
  await expect(page.getByLabel("Observation period")).toHaveValue("latest");
  await expect(page.getByRole("button", { name: "No overlay", exact: true })).toHaveAttribute("aria-pressed", "true");
  await closeMapOptions(page);
  expect(earthdataRequests).toBe(0);
});

test("historical and latest imagery use the dates advertised by NASA", async ({
  page,
}) => {
  await mockGibs(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openMapOptions(page);
  await page.getByLabel("Observation period").selectOption("past");
  await page.getByLabel("Observation date", { exact: true }).fill("2026-11-10");
  await page
    .getByRole("button", { name: "Vegetation · NDVI", exact: true })
    .click();
  await closeMapOptions(page);
  await expect(page.getByRole("status")).toContainText("2026-11-09", {
    timeout: 20000,
  });
  await closeMapOptions(page);
  await openMapOptions(page);
  await page.getByLabel("Observation period").selectOption("latest");
  await closeMapOptions(page);
  await expect(page.getByRole("status")).toContainText("2026-11-13", {
    timeout: 20000,
  });
  await closeMapOptions(page);
});
