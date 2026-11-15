import { expect, test } from "@playwright/test";
import { calculateEconomics, type EconomicsInputs } from "../lib/economics";

const base: EconomicsInputs = {
  grainPrice: 200,
  baselineYield: 5,
  yieldChange: 10,
  seedCost: 30,
  terminationCost: 20,
  subsidy: 10,
  areaHa: 4,
};

test("calculates revenue, costs, per hectare net, total, and break-even independently", () => {
  const result = calculateEconomics(base);
  expect(result).toEqual({
    baselineRevenue: 1000,
    assumedRevenue: 1100,
    revenueChange: 100,
    returnAfterCoverCropCostsPerHa: 1060,
    totalReturnAfterCoverCropCosts: 4240,
    coverCropCost: 50,
    netChangePerHa: 60,
    totalNetChange: 240,
    breakEvenYieldChange: 4,
  });
});

test("zero yield change and no subsidy retain the full cover crop cost", () => {
  const result = calculateEconomics({
    ...base,
    yieldChange: 0,
    subsidy: 0,
  });
  expect(result?.revenueChange).toBe(0);
  expect(result?.netChangePerHa).toBe(-50);
  expect(result?.totalNetChange).toBe(-200);
  expect(result?.breakEvenYieldChange).toBe(5);
});

test("allows a signed yield loss down to negative one hundred percent", () => {
  const result = calculateEconomics({ ...base, yieldChange: -20 });
  expect(result?.assumedRevenue).toBe(800);
  expect(result?.revenueChange).toBe(-200);
  expect(result?.netChangePerHa).toBe(-240);
  expect(result?.totalNetChange).toBe(-960);
  expect(
    calculateEconomics({ ...base, yieldChange: -100 })?.assumedRevenue,
  ).toBe(0);
});

test("returns null for missing, non-finite, negative, or out-of-range inputs", () => {
  expect(calculateEconomics({} as EconomicsInputs)).toBeNull();
  expect(calculateEconomics({ ...base, grainPrice: Number.NaN })).toBeNull();
  expect(calculateEconomics({ ...base, areaHa: Infinity })).toBeNull();
  expect(calculateEconomics({ ...base, seedCost: -0.01 })).toBeNull();
  expect(calculateEconomics({ ...base, yieldChange: -100.01 })).toBeNull();
});

test("allows zero yield or price and reports undefined break-even", () => {
  expect(
    calculateEconomics({ ...base, baselineYield: 0 })?.breakEvenYieldChange,
  ).toBeNull();
  expect(
    calculateEconomics({ ...base, grainPrice: 0 })?.breakEvenYieldChange,
  ).toBeNull();
});

test("returns null when finite inputs overflow a required calculation", () => {
  expect(
    calculateEconomics({
      ...base,
      grainPrice: Number.MAX_VALUE,
      baselineYield: 2,
    }),
  ).toBeNull();
});


test("a yield reduction can retain positive returns while its change from baseline is negative", () => {
  const result = calculateEconomics({ ...base, yieldChange: -10, seedCost: 30, terminationCost: 10, subsidy: 0, areaHa: 40 });
  expect(result?.assumedRevenue).toBe(900);
  expect(result?.returnAfterCoverCropCostsPerHa).toBe(860);
  expect(result?.totalReturnAfterCoverCropCosts).toBe(34400);
  expect(result?.netChangePerHa).toBe(-140);
  expect(result?.totalNetChange).toBe(-5600);
});
