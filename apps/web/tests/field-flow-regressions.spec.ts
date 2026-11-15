import { expect, test } from "@playwright/test";

async function seed(page: import("@playwright/test").Page, count = 1) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.addInitScript((size) => {
    if (localStorage.getItem("flow-seeded")) return;
    localStorage.setItem("flow-seeded", "1");
    const fields = Array.from({ length: size }, (_, i) => ({
      id: `field-${i}`, name: `Field ${i}`, location: { latitude: 39, longitude: -99 },
      currentCrop: "wheat", cropSource: "manual", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }));
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, fields }));
  }, count);
  await page.goto("/fields");
}

test("a clean field edit does not leak into Atlas details", async ({ page }) => {
  await seed(page);
  await page.getByRole("complementary", { name: "My fields", exact: true }).getByRole("button", { name: "Field 0", exact: true }).click();
  const field = page.getByRole("dialog", { name: "Field 0", exact: true });
  await field.getByRole("button", { name: "Edit field details", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await page.getByLabel("Data view", { exact: true }).selectOption("research");
  await page.getByRole("dialog", { name: "Map options", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Selected location details", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Region overview", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Field details", exact: true })).toHaveCount(0);
});

test("choosing a saved field cancels armed point selection", async ({ page }) => {
  await seed(page);
  await page.getByRole("button", { name: "Select point", exact: true }).click();
  await expect(page.getByRole("group", { name: "Point selection actions" })).toBeVisible();
  await page.getByRole("complementary", { name: "My fields", exact: true }).getByRole("button", { name: "Field 0", exact: true }).click();
  await page.getByRole("dialog", { name: "Field 0", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("group", { name: "Point selection actions" })).toHaveCount(0);
});

test("desktop saved fields scroll to the final record without hiding creation controls", async ({ page }) => {
  await seed(page, 30);
  const panel = page.getByRole("complementary", { name: "My fields", exact: true });
  const list = panel.getByRole("list", { name: "Saved fields", exact: true });
  await expect.poll(() => list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const last = panel.getByRole("button", { name: "Field 29", exact: true });
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(page.getByRole("dialog", { name: "Field 29", exact: true })).toBeVisible();
});

test("starting point selection protects an edited field before changing tools", async ({ page }) => {
  await seed(page);
  await page.getByRole("complementary", { name: "My fields", exact: true }).getByRole("button", { name: "Field 0", exact: true }).click();
  await page.getByRole("dialog", { name: "Field 0", exact: true }).getByRole("button", { name: "Edit field details", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Field details", exact: true });
  await editor.getByLabel("Field name", { exact: true }).fill("Unfinished rename");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Select point", exact: true }).click();
  const guard = page.getByRole("alertdialog", { name: "Save field changes?", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(page.getByRole("group", { name: "Point selection actions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Selected location details", exact: true }).click();
  await expect(editor.getByLabel("Field name", { exact: true })).toHaveValue("Unfinished rename");
});
