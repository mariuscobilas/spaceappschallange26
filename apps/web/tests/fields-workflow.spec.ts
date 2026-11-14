import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();

function field(id: string, name: string, west: number, east: number, crop: string) {
  return {
    id,
    name,
    location: { latitude: 38.99, longitude: west },
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [west, 38.99],
          [east, 38.99],
          [east, 39.0],
          [west, 39.0],
          [west, 38.99],
        ],
      ],
    },
    currentCrop: crop,
    cropSource: "manual",
    createdAt: now,
    updatedAt: now,
  };
}

async function seedFields(page: Page, fields: ReturnType<typeof field>[]) {
  await page.addInitScript(
    ({ items }) => {
      localStorage.setItem(
        "fields-workflow-seeded",
        localStorage.getItem("fields-workflow-seeded") ?? "1",
      );
      if (localStorage.getItem("fields-workflow-seeded") !== "1") return;
      if (localStorage.getItem("meridian.fields.v1")) return;
      localStorage.setItem(
        "meridian.fields.v1",
        JSON.stringify({ version: 1, activeFieldId: items[0]?.id, fields: items }),
      );
    },
    { items: fields },
  );
}

test("restores a saved boundary and propagates its area through plan and economics", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFields(page, [field("field-a", "North field", -99.01, -99, "wheat")]);
  await page.goto("/");

  await expect(page.getByLabel("Saved fields")).toHaveValue("field-a");
  await expect(page.getByLabel("Cash crop")).toHaveValue("wheat");
  await page.getByRole("button", { name: "Selected location details" }).click();
  const details = page.getByRole("dialog", { name: "North field" });
  await expect(details.getByText(/Geodesic field area/)).toBeVisible();
  await expect(details.getByText(/ha$/)).toBeVisible();
  await details.getByRole("button", { name: "Edit field details" }).click();
  const editor = page.getByRole("dialog", { name: "Field details" });
  await editor.getByLabel("Field name").fill("North revised");
  await editor.getByLabel("Cash crop").selectOption("corn");
  await editor.getByRole("button", { name: "Save field" }).click();
  await expect(page.getByLabel("Saved fields")).toHaveValue("field-a");
  await expect(page.getByLabel("Cash crop")).toHaveValue("corn");

  await page.getByRole("link", { name: "Field Planner" }).click();
  const planArea = page.getByLabel("Field area (ha)");
  await expect(planArea).toHaveAttribute("readonly", "");
  await expect(planArea).toHaveValue(/\d+(\.\d+)?/);
  await expect(page.getByText("Calculated from saved field boundary.").first()).toBeVisible();
  const expectedArea = await planArea.inputValue();
  await page.getByLabel("Cover crop", { exact: true }).selectOption("pea");
  await page.getByLabel("Notes").fill("Boundary area is authoritative.");
  await page.getByRole("button", { name: "Save field plan" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();

  await page.getByRole("link", { name: "Economics", exact: true }).click();
  const economicsArea = page.getByLabel(/Field area/);
  await expect(economicsArea).toHaveAttribute("readonly", "");
  await expect(economicsArea).toHaveValue(expectedArea);
  await expect(page.getByText("Calculated from saved field boundary.").first()).toBeVisible();
  await page.getByLabel("Grain price").fill("215");
  await page.reload();
  await expect(page.getByLabel(/Field area/)).toHaveValue(expectedArea);
  await expect(page.getByLabel("Grain price")).toHaveValue("215");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meridian.field-plans.v2") ?? "{}"),
  );
  expect(stored["field-a|corn"]?.areaHa).toBe(expectedArea);
  expect(stored["field-a|corn"]?.coverCrop).toBe("pea");
});

test("keeps economics drafts separate for saved field contexts and restores the active field", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFields(page, [
    field("field-a", "North field", -99.01, -99, "wheat"),
    field("field-b", "South field", -99.02, -99, "soybeans"),
  ]);
  await page.goto("/economics");
  const firstArea = await page.getByLabel(/Field area/).inputValue();
  await page.getByLabel("Grain price").fill("215");

  await page.getByRole("link", { name: "Explore" }).click();
  await page.getByLabel("Saved fields").selectOption("field-b");
  await expect(page.getByLabel("Cash crop")).toHaveValue("soybeans");
  await page.getByRole("link", { name: "Economics", exact: true }).click();
  const secondArea = await page.getByLabel(/Field area/).inputValue();
  expect(secondArea).not.toBe(firstArea);
  await expect(page.getByLabel("Grain price")).toHaveValue("");
  await page.getByLabel("Grain price").fill("180");

  await page.reload();
  await expect(page.getByLabel(/Field area/)).toHaveValue(secondArea);
  await expect(page.getByLabel("Grain price")).toHaveValue("180");
  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page.getByLabel("Saved fields")).toHaveValue("field-b");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meridian.economics.v2") ?? "{}"),
  );
  expect(stored["field-a|wheat"]?.grainPrice).toBe("215");
  expect(stored["field-b|soybeans"]?.grainPrice).toBe("180");
});

test("manual economics area stays within the 5,000 hectare cap", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/economics");
  const area = page.getByLabel(/Field area/);
  await expect(area).not.toHaveAttribute("readonly", "");
  await area.fill("5001");
  await expect(area).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Enter an area greater than 0 and no more than 5,000 ha."),
  ).toBeVisible();
  await area.fill("5000");
  await expect(area).not.toHaveAttribute("aria-invalid", "true");
});

test("land-cover suggestion only changes a field after explicit acceptance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/land-cover?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "cropland",
        code: 1,
        category: "Corn",
        suggestedCrop: "corn",
        year: new Date().getUTCFullYear(),
        requestedYear: new Date().getUTCFullYear(),
        sample: { latitude: 38.995, longitude: -99.005 },
        source: "USDA Cropland Data Layer",
        message: "Recorded land cover suggests corn.",
      }),
    }),
  );
  await seedFields(page, [field("field-a", "North field", -99.01, -99, "wheat")]);
  await page.goto("/");
  await page.getByRole("button", { name: "Selected location details" }).click();
  const details = page.getByRole("dialog", { name: "North field" });
  await expect(
    details.getByText("Recorded land cover · Corn", { exact: true }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Edit field details" }).click();
  const editor = page.getByRole("dialog", { name: "Field details" });
  await expect(editor.getByLabel("Cash crop")).toHaveValue("wheat");
  await editor.getByRole("button", { name: "Use detected crop" }).click();
  await expect(editor.getByLabel("Cash crop")).toHaveValue("corn");
  await editor.getByRole("button", { name: "Save field" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meridian.fields.v1") ?? "{}").fields[0],
  );
  expect(saved.currentCrop).toBe("corn");
  expect(saved.cropSource).toBe("cdl");
});

test("unsaved field edits can stay, discard, or save before navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFields(page, [field("field-a", "North field", -99.01, -99, "wheat")]);
  await page.goto("/");
  await page.getByRole("button", { name: "Selected location details" }).click();
  let details = page.getByRole("dialog", { name: "North field" });
  await details.getByRole("button", { name: "Edit field details" }).click();
  details = page.getByRole("dialog", { name: "Field details" });
  await details.getByLabel("Field name").fill("Unsaved name");
  await details.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Field Planner" }).click();
  const guard = page.getByRole("alertdialog", { name: "Save field changes?" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Stay here" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Selected location details" }).click();
  details = page.getByRole("dialog", { name: "Field details" });
  await expect(details.getByLabel("Field name")).toHaveValue("Unsaved name");
  await details.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "Field Planner" }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("heading", { name: "Plan a cover crop" })).toBeVisible();
  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page.getByLabel("Saved fields")).toHaveValue("field-a");
  await page.getByRole("button", { name: "Selected location details" }).click();
  details = page.getByRole("dialog", { name: "North field" });
  await details.getByRole("button", { name: "Edit field details" }).click();
  details = page.getByRole("dialog", { name: "Field details" });
  await details.getByLabel("Field name").fill("Saved name");
  await details.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Field Planner" }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Plan a cover crop" })).toBeVisible();
  await page.getByRole("link", { name: "Explore" }).click();
  await page.getByRole("button", { name: "Selected location details" }).click();
  await expect(page.getByRole("dialog", { name: "Saved name" })).toBeVisible();
});
