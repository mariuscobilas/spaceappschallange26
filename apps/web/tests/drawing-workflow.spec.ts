import { expect, test } from "@playwright/test";

test("draws and saves a boundary that survives reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/");

  const canvas = page.locator(".map-canvas");
  const drawButton = page.getByRole("button", { name: "Draw boundary" });
  await expect(drawButton).toBeEnabled({ timeout: 30_000 });
  for (let index = 0; index < 7; index++) {
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  }
  await expect(canvas).toHaveAttribute("data-hex-resolution", "5");
  await drawButton.click();

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas is not visible");
  const centerX = bounds.x + bounds.width * 0.43;
  const centerY = bounds.y + bounds.height * 0.41;
  for (const [x, y] of [
    [centerX - 50, centerY - 50],
    [centerX + 50, centerY - 50],
    [centerX + 50, centerY + 50],
    [centerX - 50, centerY + 50],
  ]) {
    await page.mouse.click(x, y);
  }

  await page.getByRole("button", { name: "Finish boundary" }).click();
  const details = page.getByRole("dialog", { name: "Field details" });
  await expect(details).toBeVisible();
  await details.getByLabel("Field name").fill("Browser test field");
  await details.getByRole("button", { name: "Save field" }).click();

  const savedBeforeReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}"),
  );
  expect(savedBeforeReload.fields).toHaveLength(1);
  const savedBoundary = savedBeforeReload.fields[0].boundary;
  expect(savedBoundary.type).toBe("Polygon");
  expect(savedBoundary.coordinates[0].length).toBeGreaterThanOrEqual(4);
  expect(savedBoundary.coordinates[0][0]).toEqual(
    savedBoundary.coordinates[0].at(-1),
  );
  expect(savedBeforeReload.fields[0].areaHectares).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByLabel("Saved fields")).toHaveValue(
    savedBeforeReload.fields[0].id,
  );
  const savedAfterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}"),
  );
  expect(savedAfterReload.fields[0].boundary).toEqual(savedBoundary);
});
