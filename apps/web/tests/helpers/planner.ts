import { expect, type Page } from "@playwright/test";

/** Switch fields through the library, preserving editor drafts and resume state. */
export async function choosePlannerField(page: Page, name: string, step: "Calendar" | "Budget" = "Calendar") {
  await page.getByRole("link", { name: "Back to fields", exact: true }).click();
  await expect(page).toHaveURL(/\/planner$/);
  const card = page.getByRole("region", { name: "Saved fields", exact: true }).locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
  await card.getByRole("button", { name: /^(Create plan|Continue draft|Continue plan)$/ }).click();
  const target = step === "Calendar" ? /\/planner\/calendar$/ : /\/economics$/;
  await page.getByRole("navigation", { name: "Plan editor", exact: true }).getByRole("link", { name: step, exact: true }).click();
  await expect(page).toHaveURL(target);
}
