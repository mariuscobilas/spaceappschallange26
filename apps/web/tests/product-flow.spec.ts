import { test, expect } from "@playwright/test";

const field = {
  id: "field-north",
  name: "North field",
  location: { latitude: 38.99, longitude: -99.01 },
  currentCrop: "wheat",
  cropSource: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("Explore stays read-only and Planner starts from saved fields", async ({ page }) => {
  await page.goto("/");
  const explore = page.getByLabel("Explore workspace", { exact: true });
  await expect(explore.getByRole("button", { name: /Save field|Delete field|Draw boundary|Select point/ })).toHaveCount(0);
  await expect(explore.getByRole("dialog")).toHaveCount(0);

  const main = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(main.getByRole("link", { name: "Economics", exact: true })).toHaveCount(0);
  await main.getByRole("link", { name: "Field Planner", exact: true }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("heading", { name: "Add your first field", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add first field", exact: true })).toHaveAttribute("href", "/fields");
  await expect(page.getByLabel("Cash crop planting date")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Saved plans", exact: true })).toHaveAttribute("href", "/planner/saved");
});

test("field library launches a selected field into the calendar editor", async ({ page }) => {
  await page.addInitScript((savedField) => {
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: savedField.id, fields: [savedField] }));
  }, field);
  await page.goto("/planner");

  const row = page.getByRole("region", { name: "Saved fields", exact: true });
  await expect(row).toContainText("North field");
  await expect(row).toContainText("Wheat");
  await expect(row).toContainText("Not started");
  await row.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
  await expect(page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Back to fields", exact: true })).toHaveAttribute("href", "/planner");
  const editorNav = page.getByRole("navigation", { name: "Plan editor", exact: true });
  await expect(editorNav.getByRole("link", { name: "Budget", exact: true })).toHaveAttribute("href", "/economics");
  await expect(editorNav.getByRole("link", { name: "Review", exact: true })).toHaveAttribute("href", "/planner/review");
  await expect(page.getByLabel("Cash crop planting date")).toBeVisible();
});
