import { choosePlannerField } from "./helpers/planner";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const available = JSON.parse(readFileSync("../../shared/payloads/field-conditions-available.json", "utf8"));

function responseFor(url: string, kind: "available" | "partial" = "available") {
  const query = new URL(url).searchParams;
  const response = structuredClone(available);
  response.sample = { latitude: Number(query.get("latitude")), longitude: Number(query.get("longitude")) };
  response.requestedDate = query.get("as_of");
  const end = new Date(`${response.requestedDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  response.precipitation30d.periodStart = start.toISOString().slice(0, 10);
  response.precipitation30d.periodEnd = end.toISOString().slice(0, 10);
  response.rootZoneWetness.periodStart = response.rootZoneWetness.periodEnd = end.toISOString().slice(0, 10);
  if (kind === "partial") response.rootZoneWetness = {
    ...response.rootZoneWetness, status: "unavailable", value: null,
    periodStart: null, periodEnd: null, message: "No valid wetness sample for this period.",
  };
  return response;
}

async function openFieldConditions(page: Page) {
  await page.getByText("Conditions and sources", { exact: true }).click();
}

async function openCalendar(page: Page, index = 0) {
  const library = page.getByRole("region", { name: "Saved fields", exact: true });
  await library.getByRole("button", { name: /Create plan|Continue plan|Continue draft/ }).nth(index).click();
  await expect(page).toHaveURL(/\/planner\/calendar$/);
}

async function seedTwoFields(page: Page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
      { id: "south", name: "South field", location: { latitude: 38, longitude: -99 }, currentCrop: "corn", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
}

test("shows actual source periods and spatial meaning for historical field context", async ({ page }) => {
  await page.route("**/api/v1/field-conditions?**", (route) => route.fulfill({ json: responseFor(route.request().url()) }));
  await seedTwoFields(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await page.getByLabel("Observation period").selectOption("past");
  await page.getByLabel("Observation date", { exact: true }).fill("2020-05-01");
  await page.getByRole("dialog", { name: "Map options" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/fields");
  await page.getByRole("complementary", { name: "My fields", exact: true }).getByRole("button", { name: "North field", exact: true }).click();
  const details = page.getByRole("dialog", { name: "North field", exact: true });
  const conditions = details.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("30-day precipitation: 24.8 mm")).toBeVisible();
  await expect(conditions.getByLabel("Root-zone wetness: 42%")).toBeVisible();
  await expect(conditions.getByLabel("Available water storage: 146 mm")).toBeVisible();
  await expect(conditions).toContainText("2020-04-29");
  await expect(conditions).toContainText("Relative saturation");
  await conditions.getByText("Sources and interpretation", { exact: true }).click();
  await expect(conditions).toContainText("0.5° latitude");
  await expect(conditions.getByRole("link", { name: /NASA POWER/ }).first()).toHaveAttribute("href", /^https:\/\/power\.larc\.nasa\.gov\//);
  await expect(details).toContainText("North field");
});

test("partial conditions can refresh while field planning stays usable", async ({ page }) => {
  let recovered = false;
  await page.route("**/api/v1/field-conditions?**", (route) => route.fulfill({ json: responseFor(route.request().url(), recovered ? "available" : "partial") }));
  await seedTwoFields(page);
  await page.goto("/planner");
  await openCalendar(page);
  await openFieldConditions(page);
  const conditions = page.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("Root-zone wetness: Unavailable")).toBeVisible();
  await expect(conditions.getByLabel("30-day precipitation: 24.8 mm")).toBeVisible();
  await page.getByText("Field area and notes", { exact: true }).click();
  await page.getByLabel("Notes").fill("Keep this plan while checking data.");
  recovered = true;
  await conditions.getByRole("button", { name: "Refresh field conditions", exact: true }).click();
  await expect(conditions.getByLabel("Root-zone wetness: 42%")).toBeVisible();
  await expect(page.getByLabel("Notes")).toHaveValue("Keep this plan while checking data.");
});

test("a late response for another field never replaces the selected field's conditions", async ({ page }) => {
  await seedTwoFields(page);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await seedTwoFields(page);
  await page.route("**/api/v1/field-conditions?**", async (route) => {
    const url = route.request().url();
    const north = new URL(url).searchParams.get("latitude") === "39";
    if (north) await wait;
    const response = responseFor(url);
    response.precipitation30d.value = north ? 99 : 12;
    await route.fulfill({ json: response }).catch(() => {});
  });
  await page.goto("/planner");
  await openCalendar(page);
  await openFieldConditions(page);
  await expect(page.getByLabel("Plan context")).toContainText("North field");
  await choosePlannerField(page, "South field");
  await openFieldConditions(page);
  const conditions = page.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("30-day precipitation: 12 mm")).toBeVisible();
  release();
  await expect(conditions.getByLabel("30-day precipitation: 99 mm")).toHaveCount(0);
  await expect(conditions.getByLabel("30-day precipitation: 12 mm")).toBeVisible();
});

test("disconnected conditions leave editable forms and explicit unavailable values", async ({ page }) => {
  await page.route("**/api/v1/field-conditions?**", (route) => route.abort());
  await seedTwoFields(page);
  await page.goto("/planner");
  await openCalendar(page);
  await openFieldConditions(page);
  const conditions = page.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("Root-zone wetness: Unavailable")).toBeVisible();
  await expect(conditions.getByLabel("30-day precipitation: Unavailable")).toBeVisible();
  await page.getByText("Field area and notes", { exact: true }).click();
  await page.getByLabel("Notes").fill("My local draft still works.");
  await expect(page.getByRole("complementary", { name: "Calendar summary", exact: true }).getByRole("button", { name: "Review calendar only", exact: true }).first()).toBeDisabled();
  await page.getByLabel("Cash crop planting date", { exact: true }).fill(`${new Date().getFullYear() + 1}-06-01`);
  await page.getByRole("complementary", { name: "Calendar summary", exact: true }).getByRole("button", { name: "Review calendar only", exact: true }).click();
  await expect(page).toHaveURL(/\/planner\/review\?budget=skip$/);
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("Plan saved on this device.", { exact: true })).toBeVisible();
});

test("unverified response values are withheld instead of becoming plausible readings", async ({ page }) => {
  await page.route("**/api/v1/field-conditions?**", (route) => {
    const response = responseFor(route.request().url());
    response.rootZoneWetness.value = 1.6;
    return route.fulfill({ json: response });
  });
  await seedTwoFields(page);
  await page.goto("/planner");
  await openCalendar(page);
  await openFieldConditions(page);
  const conditions = page.getByRole("region", { name: "Field conditions", exact: true });
  await expect(conditions.getByLabel("Root-zone wetness: Unavailable")).toBeVisible();
  await expect(conditions.getByText("160%", { exact: true })).toHaveCount(0);
});
