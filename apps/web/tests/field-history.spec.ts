import { expect, test } from "@playwright/test";

test("browser Back protects unsaved field details on the dedicated editing route", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Field Planner", exact: true }).click();
  await page.getByRole("link", { name: "Add first field", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  await page.getByRole("button", { name: "Select point", exact: true }).click();
  const canvas = page.locator(".map-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map not visible");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Unfinished field");
  await page.goBack();
  const guard = page.getByRole("alertdialog", { name: "Save field changes?", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  await page.getByRole("button", { name: "Selected location details", exact: true }).click();
  await expect(editor.getByLabel("Field name", { exact: true })).toHaveValue("Unfinished field");
});
