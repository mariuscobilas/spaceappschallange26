import { expect, test } from "@playwright/test";

test("Atlas compatibility URL redirects into Explore and query changes preserve the mounted map", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("meridian.map-settings.v3", JSON.stringify({
    mode: "atlas", crop: "wheat", timeMode: "latest", observationDate: new Date().toISOString().slice(0, 10),
    overlay: "off", opacity: .55,
    selection: { name: "Hays", latitude: 38.8792, longitude: -99.3268, benchmarkId: "hays" },
  })));
  await page.goto("/atlas?crop=soybeans&period=2020");
  await expect(page).toHaveURL(/\/?view=research&crop=soybeans&period=2020$/);
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const labels = (await navigation.getByRole("link").allTextContents()).map((text) => text.trim()).filter(Boolean);
  expect(labels).toEqual(["Explore", "Field Planner", "Ask Meridian"]);
  await expect(navigation.getByRole("link", { name: "Regional Atlas", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").mode)).toBe("field");

  const map = page.locator(".workspace-map");
  await expect(map).toBeVisible();
  await map.evaluate((node) => node.setAttribute("data-test-map-instance", "shared"));
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Map options", exact: true });
  await expect(options.getByLabel("Research crop", { exact: true })).toHaveValue("soybeans");
  await options.getByLabel("Data view", { exact: true }).selectOption("conditions");
  await expect(page).toHaveURL(/\/$/);
  await expect(map).toHaveAttribute("data-test-map-instance", "shared");
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\?view=research&crop=soybeans&period=2020$/);
  await expect(map).toHaveAttribute("data-test-map-instance", "shared");

  await navigation.getByRole("link", { name: "Field Planner", exact: true }).click();
  await page.getByRole("link", { name: "Add first field", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-test-map-instance", "shared");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").mode)).toBe("field");
  await navigation.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(map).toHaveAttribute("data-test-map-instance", "shared");
});

test("Explore map clicks browse without creating a draft or prompting on navigation", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/");
  const map = page.locator(".map-canvas");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  await page.mouse.click(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
  await expect(page.getByRole("dialog", { name: "Field details" })).toHaveCount(0);
  await page.getByRole("dialog", { name: "Hexagon information", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/fields");
  await expect(page).toHaveURL(/\/fields$/);
  await expect(page.getByRole("alertdialog", { name: "Save field changes?" })).toHaveCount(0);
  const fields = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields ?? []);
  expect(fields).toHaveLength(0);
});

test("saved plans is linked from the field library and remains reachable with the sidebar collapsed", async ({ page }) => {
  await page.goto("/planner");
  const mainNav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(mainNav.getByRole("link", { name: "Saved plans", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Saved plans", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/saved$/);
  await expect(mainNav.getByRole("link", { name: "Field Planner", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await mainNav.getByRole("link", { name: "Field Planner", exact: true }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("heading", { name: "Choose a field to plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Workspace backup", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace backup" })).toBeVisible();
});

test("field library fits a phone and the skip link reaches main content", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/planner");
  await expect(page.getByRole("button", { name: "Toggle navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved plans", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Skip to workspace" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-content")).toBeFocused();
});

test("mobile main navigation has no Atlas destination and research stays in Explore", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "Regional Atlas", exact: true })).toHaveCount(0);
  await navigation.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  let options = page.getByRole("dialog", { name: "Map options", exact: true });
  await options.getByLabel("Data view", { exact: true }).selectOption("research");
  await expect(page).toHaveURL(/\?view=research/);
  await expect(options).toBeVisible();
  await options.getByLabel("Data view", { exact: true }).selectOption("conditions");
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").mode)).toBe("field");
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("aria-current", "page");
});
