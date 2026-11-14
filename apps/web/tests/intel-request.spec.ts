import { expect, test } from "@playwright/test";
import { describeConditions } from "../lib/intel-request";

test("prepared evidence preserves numeric units, periods, provenance, and missing states", () => {
  const result = {
    sample: { latitude: 38, longitude: -98 },
    requestedDate: "2026-11-14",
    retrievedAt: "2026-11-14T12:00:00.000Z",
    precipitation30d: {
      status: "available" as const, value: 18.4, unit: "mm" as const,
      periodStart: "2026-10-16", periodEnd: "2026-11-14", source: "NASA POWER",
      sourceUrl: "https://power.larc.nasa.gov/", spatialResolution: "0.5° grid", message: "Verified.",
    },
    rootZoneWetness: {
      status: "available" as const, value: 0.436, unit: "fraction" as const,
      periodStart: "2026-11-14", periodEnd: "2026-11-14", source: "NASA POWER",
      sourceUrl: "https://power.larc.nasa.gov/", spatialResolution: "0.5° grid", message: "Verified.",
    },
    availableWaterStorage: {
      status: "unavailable" as const, value: null, unit: "mm" as const,
      periodStart: null, periodEnd: null, source: "USDA NRCS Web Soil Survey",
      sourceUrl: "https://websoilsurvey.nrcs.usda.gov/", spatialResolution: "Not available", message: "No map unit.",
    },
    soilMapUnit: null,
  };
  const text = describeConditions(result);
  expect(text).toContain("18.4 mm");
  expect(text).toContain("2026-10-16 to 2026-11-14");
  expect(text).toContain("Root-zone wetness: 44 %");
  expect(text).toContain("Unavailable; period: period unavailable");
  expect(text).toContain("https://websoilsurvey.nrcs.usda.gov/");
  expect(describeConditions({ ...result, availableWaterStorage: { ...result.availableWaterStorage, status: "available", value: 125 } })).toContain("125 mm; period: current soil survey mapping; no observation period");
  expect(text).toContain("Sample coordinates: 38.00000, -98.00000");
  expect(text).toContain("not field-wide measurements");
});
