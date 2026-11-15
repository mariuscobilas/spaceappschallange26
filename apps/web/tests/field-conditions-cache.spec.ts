import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = JSON.parse(readFileSync("../../shared/payloads/field-conditions-available.json", "utf8"));
function responseFor(url: string) {
  const query = new URL(url).searchParams;
  const response = structuredClone(fixture);
  response.sample = { latitude: Number(query.get("latitude")), longitude: Number(query.get("longitude")) };
  response.requestedDate = query.get("as_of");
  const end = new Date(`${response.requestedDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  response.precipitation30d.periodStart = start.toISOString().slice(0, 10);
  response.precipitation30d.periodEnd = end.toISOString().slice(0, 10);
  response.rootZoneWetness.periodStart = response.rootZoneWetness.periodEnd = end.toISOString().slice(0, 10);
  return response;
}

async function seedField(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
}

async function openCalendar(page: import("@playwright/test").Page) {
  await page.getByRole("region", { name: "Saved fields", exact: true }).getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
}

test("reuses field conditions across Planner and Intel and shared retry makes one fresh request", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/field-conditions?**", (route) => {
    requests++;
    return route.fulfill({ json: responseFor(route.request().url()) });
  });
  await seedField(page);
  await page.goto("/planner");
  await openCalendar(page);
  await page.getByText("Conditions and sources", { exact: true }).click();
  const conditions = page.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("30-day precipitation: 24.8 mm")).toBeVisible();
  expect(requests).toBe(1);

  await page.getByRole("link", { name: "Ask Meridian", exact: true }).click();
  await expect(page).toHaveURL(/\/intel$/);
  await expect(page.getByLabel("Prepared request", { exact: true })).toHaveValue(/Field conditions requested for/);
  expect(requests).toBe(1);

  await page.getByRole("link", { name: "Field Planner", exact: true }).click();
  await openCalendar(page);
  await page.getByText("Conditions and sources", { exact: true }).click();
  const refreshed = page.waitForRequest("**/api/v1/field-conditions?**");
  await page.getByRole("region", { name: "Field conditions", exact: true }).getByRole("button", { name: "Refresh field conditions" }).click();
  await refreshed;
  await expect.poll(() => requests).toBe(2);
  await expect(conditions.getByLabel("30-day precipitation: 24.8 mm")).toBeVisible();
});
