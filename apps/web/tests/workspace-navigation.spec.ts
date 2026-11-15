import { expect, test } from "@playwright/test";

test("map workspaces have direct routes and restore their route-specific mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("meridian.map-settings.v3", JSON.stringify({
    mode: "field", crop: "wheat", timeMode: "latest", observationDate: new Date().toISOString().slice(0, 10),
    overlay: "off", opacity: .55,
    selection: { name: "Hays", latitude: 38.8792, longitude: -99.3268, benchmarkId: "hays" },
  })));
  await page.goto("/atlas");
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const labels = (await navigation.getByRole("link").allTextContents()).map((text) => text.trim()).filter(Boolean);
  expect(labels).toEqual(["Explore", "My fields", "Regional Atlas", "Field Planner", "Economics", "Ask Meridian"]);
  await expect(page.getByRole("link", { name: "Regional Atlas", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").mode)).toBe("atlas");
  await page.goto("/fields");
  await expect(page.getByRole("link", { name: "My fields", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("meridian.map-settings.v3") ?? "{}").mode)).toBe("field");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("aria-current", "page");
  const map = page.locator(".workspace-map");
  await expect(map).toBeVisible();
  await map.evaluate((node) => node.setAttribute("data-test-map-instance", "shared"));
  await page.getByRole("link", { name: "My fields", exact: true }).click();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-test-map-instance", "shared");
  await page.getByRole("link", { name: "Regional Atlas", exact: true }).click();
  await expect(map).toBeVisible();
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
  await page.getByRole("link", { name: "My fields", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  await expect(page.getByRole("alertdialog", { name: "Save field changes?" })).toHaveCount(0);
  const fields = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields ?? []);
  expect(fields).toHaveLength(0);
});

test("saved plans belongs to Planner navigation and remains reachable with the sidebar collapsed", async ({ page }) => {
  await page.goto("/planner");
  const mainNav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(mainNav.getByRole("link", { name: "Saved plans", exact: true })).toHaveCount(0);
  const plannerNav = page.getByRole("navigation", { name: "Field Planner pages" });
  await plannerNav.getByRole("link", { name: "Saved plans", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/saved$/);
  await expect(mainNav.getByRole("link", { name: "Field Planner", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await plannerNav.getByRole("link", { name: "Plan termination", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan termination", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Workspace backup", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace backup" })).toBeVisible();
});

test("Planner page navigation fits a phone and the skip link reaches main content", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/planner/saved");
  const nav = page.getByRole("navigation", { name: "Field Planner pages" });
  await expect(nav.getByRole("link", { name: "Saved plans", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Plan termination", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Skip to workspace" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-content")).toBeFocused();
});
