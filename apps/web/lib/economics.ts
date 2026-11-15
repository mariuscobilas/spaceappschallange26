export interface EconomicsInputs {
  grainPrice: number;
  baselineYield: number;
  yieldChange: number;
  seedCost: number;
  terminationCost: number;
  subsidy: number;
  areaHa: number;
}

export interface EconomicsResult {
  baselineRevenue: number;
  assumedRevenue: number;
  revenueChange: number;
  returnAfterCoverCropCostsPerHa: number;
  totalReturnAfterCoverCropCosts: number;
  coverCropCost: number;
  netChangePerHa: number;
  totalNetChange: number;
  breakEvenYieldChange: number | null;
}

/** Calculates transparent, user-entered economics; it makes no market or yield predictions. */
export function calculateEconomics(
  input: EconomicsInputs,
): EconomicsResult | null {
  const values = [
    input.grainPrice,
    input.baselineYield,
    input.yieldChange,
    input.seedCost,
    input.terminationCost,
    input.subsidy,
    input.areaHa,
  ];

  if (
    !values.every(Number.isFinite) ||
    input.grainPrice < 0 ||
    input.baselineYield < 0 ||
    input.yieldChange < -100 ||
    input.seedCost < 0 ||
    input.terminationCost < 0 ||
    input.subsidy < 0 ||
    input.areaHa < 0
  ) {
    return null;
  }

  const baselineRevenue = input.baselineYield * input.grainPrice;
  const assumedYield = input.baselineYield * (1 + input.yieldChange / 100);
  const assumedRevenue = assumedYield * input.grainPrice;
  const revenueChange = assumedRevenue - baselineRevenue;
  const coverCropCost = input.seedCost + input.terminationCost;
  const netChangePerHa =
    input.baselineYield * (input.yieldChange / 100) * input.grainPrice -
    input.seedCost -
    input.terminationCost +
    input.subsidy;
  const totalNetChange = netChangePerHa * input.areaHa;
  // A partial subtotal: other crop production expenses are not provided here.
  const returnAfterCoverCropCostsPerHa = assumedRevenue - coverCropCost + input.subsidy;
  const totalReturnAfterCoverCropCosts = returnAfterCoverCropCostsPerHa * input.areaHa;
  const breakEvenDenominator = input.baselineYield * input.grainPrice;
  const breakEvenNumerator = coverCropCost - input.subsidy;
  const breakEvenYieldChange =
    breakEvenDenominator === 0
      ? null
      : (breakEvenNumerator / breakEvenDenominator) * 100;

  if (
    ![
      baselineRevenue,
      assumedYield,
      assumedRevenue,
      revenueChange,
      coverCropCost,
      netChangePerHa,
      totalNetChange,
      returnAfterCoverCropCostsPerHa,
      totalReturnAfterCoverCropCosts,
    ].every(Number.isFinite)
  ) {
    return null;
  }

  return {
    baselineRevenue,
    assumedRevenue,
    revenueChange,
    coverCropCost,
    netChangePerHa,
    totalNetChange,
    returnAfterCoverCropCostsPerHa,
    totalReturnAfterCoverCropCosts,
    breakEvenYieldChange:
      breakEvenYieldChange !== null && Number.isFinite(breakEvenYieldChange)
        ? breakEvenYieldChange
        : null,
  };
}
