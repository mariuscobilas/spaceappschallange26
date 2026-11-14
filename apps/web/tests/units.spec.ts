import { expect, test } from "@playwright/test";
import { calculateEconomics } from "../lib/economics";
import {
  HECTARES_TO_ACRES,
  economicsUnitLabel,
  formatArea,
  fromCanonicalEconomicsValue,
  toCanonicalEconomicsValue,
} from "../lib/units";

test("formats area in either unit system", () => {
  expect(formatArea(1, "us")).toBe("2.47 ac");
  expect(formatArea(HECTARES_TO_ACRES, "metric")).toBe("2.47 ha");
});

test("round trips grain price and yield through crop bushel weights", () => {
  for (const crop of ["wheat", "corn", "soybeans", "sorghum"]) {
    for (const [key, value] of [["grainPrice", 245], ["baselineYield", 6.75]] as const) {
      const us = fromCanonicalEconomicsValue(key, value, "us", crop);
      expect(toCanonicalEconomicsValue(key, us, "us", crop)).toBeCloseTo(value, 10);
    }
  }
  expect(economicsUnitLabel("baselineYield", "us", "corn")).toBe("bu/ac");
});

test("round trips cotton lint price/yield and per-area inputs", () => {
  for (const [key, value] of [
    ["grainPrice", 2.1],
    ["baselineYield", 1.2],
    ["seedCost", 42],
    ["terminationCost", 16],
    ["subsidy", 8],
    ["areaHa", 12.3],
  ] as const) {
    const us = fromCanonicalEconomicsValue(key, value, "us", "cotton");
    expect(toCanonicalEconomicsValue(key, us, "us", "cotton")).toBeCloseTo(value, 10);
  }
  expect(economicsUnitLabel("grainPrice", "us", "cotton")).toBe("USD/lb");
  expect(economicsUnitLabel("baselineYield", "us", "cotton")).toBe("lb/ac");
});

test("U.S. grain entries produce the same result and do not change stored metric inputs on unit switches", () => {
  const metric = { grainPrice: 220, baselineYield: 7.2, yieldChange: 4, seedCost: 35, terminationCost: 18, subsidy: 6, areaHa: 9.5 };
  const us = Object.fromEntries(Object.entries(metric).map(([rawKey, value]) => {
    const key = rawKey as keyof typeof metric;
    return [key, key === "yieldChange" ? value : fromCanonicalEconomicsValue(key, value, "us", "corn")];
  })) as typeof metric;
  const recalculated = Object.fromEntries(Object.entries(us).map(([rawKey, value]) => {
    const key = rawKey as keyof typeof metric;
    return [key, key === "yieldChange" ? value : toCanonicalEconomicsValue(key, value, "us", "corn")];
  })) as typeof metric;
  expect(calculateEconomics(recalculated)?.totalNetChange).toBeCloseTo(calculateEconomics(metric)!.totalNetChange, 8);
  expect(recalculated).toEqual({
    grainPrice: expect.closeTo(metric.grainPrice, 9),
    baselineYield: expect.closeTo(metric.baselineYield, 9),
    yieldChange: metric.yieldChange,
    seedCost: expect.closeTo(metric.seedCost, 9),
    terminationCost: expect.closeTo(metric.terminationCost, 9),
    subsidy: expect.closeTo(metric.subsidy, 9),
    areaHa: expect.closeTo(metric.areaHa, 9),
  });
});
