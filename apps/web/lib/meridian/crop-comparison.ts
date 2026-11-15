import type { MeridianChatContext, MeridianCropComparisonResult, MeridianCropComparisonRow } from "@spaceapps/shared";
import type { CropReferences, CropReference } from "./crop-references";

export type CropScenarioOverride = { crop: string; yieldTHa?: number | null; priceUsdT?: number | null; totalCostUsdHa?: number | null };
export type CropScenarioRow = MeridianCropComparisonRow;
export type CropComparison = MeridianCropComparisonResult;

const finiteNonnegative = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
};

function compatibleSavedInputs(context: MeridianChatContext): CropScenarioOverride[] {
  const current = context.crop.trim().toLowerCase();
  const overrides: CropScenarioOverride[] = [];
  const fromBudget = (crop: string, budget?: Record<string, string | undefined>) => {
    if (!budget) return;
    const parse = (key: string) => {
      const raw = budget[key];
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    };
    const yieldTHa = parse("baselineYield"), priceUsdT = parse("grainPrice");
    if (yieldTHa !== undefined || priceUsdT !== undefined) overrides.push({ crop, ...(yieldTHa !== undefined ? { yieldTHa } : {}), ...(priceUsdT !== undefined ? { priceUsdT } : {}) });
  };
  const draft = context.economicsDraft as Record<string, string | undefined> | undefined;
  const draftIsPopulated = !!draft && ["baselineYield", "grainPrice"].some((key) => typeof draft[key] === "string" && !!draft[key]?.trim());
  const draftIsAuthoritative = context.budgetStatus === "incomplete" || context.budgetState === "draft";
  if (draftIsPopulated) fromBudget(current, draft);
  else if (!draftIsAuthoritative && context.activePlan?.crop.trim().toLowerCase() === current) fromBudget(current, context.activePlan.budget as Record<string, string | undefined> | undefined);

  const byCrop = new Map<string, NonNullable<typeof context.savedAlternatives>>();
  for (const alternative of context.savedAlternatives ?? []) {
    const crop = alternative.crop.trim().toLowerCase();
    const entries = byCrop.get(crop) ?? [];
    entries.push(alternative); byCrop.set(crop, entries);
  }
  for (const [crop, alternatives] of byCrop) {
    if (crop === current || alternatives.length !== 1) continue; // Ambiguous same-crop plans are not silently combined.
    fromBudget(crop, alternatives[0].budget);
  }
  // Canonical saved economics are metric. Cover costs and subsidy are intentionally ignored.
  return overrides;
}

/** Reproducible revenue less ERS total production cost; this is a historical crop screen, not cover-crop ROI. */
export function compareCropScenarios(
  context: MeridianChatContext,
  overrides: CropScenarioOverride[] | undefined,
  references: CropReferences,
): CropComparison {
  const saved = compatibleSavedInputs(context);
  const selectedOverrides = new Map<string, CropScenarioOverride>();
  for (const entry of saved) selectedOverrides.set(entry.crop, entry);
  const explicit = new Map<string, Set<string>>();
  for (const override of overrides ?? []) {
    const crop = override.crop.trim().toLowerCase();
    const keys = explicit.get(crop) ?? new Set<string>();
    for (const key of ["yieldTHa", "priceUsdT", "totalCostUsdHa"] as const) if (override[key] !== undefined) keys.add(key);
    explicit.set(crop, keys);
    selectedOverrides.set(crop, { ...selectedOverrides.get(crop), ...override, crop });
  }

  const areaValue = finiteNonnegative(context.areaHa);
  const area = areaValue !== null && areaValue > 0 ? areaValue : null;
  const rows = references.rows.map((reference: CropReference): CropScenarioRow => {
    const override = selectedOverrides.get(reference.crop.toLowerCase());
    const yieldOverride = finiteNonnegative(override?.yieldTHa);
    const priceOverride = finiteNonnegative(override?.priceUsdT);
    const costOverride = finiteNonnegative(override?.totalCostUsdHa);
    const yieldTHa = yieldOverride ?? finiteNonnegative(reference.yieldTHa);
    const priceUsdT = priceOverride ?? finiteNonnegative(reference.priceUsdT);
    const totalCostUsdHa = costOverride ?? finiteNonnegative(reference.totalCostUsdHa);
    const grossRevenueUsdHa = yieldTHa === null || priceUsdT === null ? null : yieldTHa * priceUsdT;
    const netReturnUsdHa = totalCostUsdHa === null || grossRevenueUsdHa === null ? null : grossRevenueUsdHa - totalCostUsdHa;
    const breakEvenPriceUsdT = yieldTHa === null || yieldTHa === 0 || totalCostUsdHa === null ? null : totalCostUsdHa / yieldTHa;
    const breakEvenYieldTHa = priceUsdT === null || priceUsdT === 0 || totalCostUsdHa === null ? null : totalCostUsdHa / priceUsdT;
    const saved = selectedOverrides.get(reference.crop.toLowerCase());
    const userKeys = explicit.get(reference.crop.toLowerCase()) ?? new Set<string>();
    const inputBasis = [
      userKeys.has("yieldTHa") ? "explicit user yield override" : saved?.yieldTHa !== undefined ? "compatible saved/draft budget yield" : "USDA ERS realized yield",
      userKeys.has("priceUsdT") ? "explicit user price override" : saved?.priceUsdT !== undefined ? "compatible saved/draft budget price" : "USDA ERS realized price",
      userKeys.has("totalCostUsdHa") ? "explicit user total-cost override" : saved?.totalCostUsdHa !== undefined ? "compatible saved/draft budget total cost" : "USDA ERS operating plus allocated-overhead cost",
    ];
    return {
      crop: reference.crop, yieldTHa, priceUsdT, totalCostUsdHa, grossRevenueUsdHa, netReturnUsdHa,
      wholeFieldNetReturnUsd: area === null || area <= 0 || netReturnUsdHa === null ? null : netReturnUsdHa * area,
      wholeFieldGrossRevenueUsd: area === null || area <= 0 || grossRevenueUsdHa === null ? null : grossRevenueUsdHa * area,
      breakEvenPriceUsdT, breakEvenYieldTHa,
      sourceYear: reference.sourceYear, sourceRegion: reference.sourceRegion,
      geographicMatch: reference.geographicMatch,
      provenance: reference.sourceUrl, inputBasis,
    };
  });
  const geographicCandidates = references.geographicMatch === "partial_regional" || references.geographicMatch === "regional"
    ? rows.filter((row) => row.geographicMatch === "regional")
    : rows;
  const ranked = geographicCandidates.filter((row) => row.netReturnUsdHa !== null).sort((a, b) => b.netReturnUsdHa! - a.netReturnUsdHa!);
  return {
    planningYear: context.planningYear ?? new Date().getUTCFullYear(), referenceYear: references.referenceYear,
    geographicMatch: references.geographicMatch, geographicRegion: references.geographicRegion, countyFips: references.countyFips,
    referenceStatus: references.status, referenceMessage: references.message, provenance: references.provenance,
    rows, ranking: ranked.map((row) => row.crop),
    assumptions: [...references.assumptions,
      "Results use realized USDA ERS estimates from the stated geography and source year, not a planning-year forecast or field-level estimate.",
      "Gross revenue is primary-commodity yield multiplied by harvest price and excludes secondary-product receipts. Net return subtracts ERS operating costs and allocated overhead once.",
      "Seed, termination, and subsidy values in saved budgets are cover-crop economics and are not deducted from main-crop net return.",
      "The cross-crop ordering is a simple historical screening comparison, not a crop recommendation, cover-versus-fallow effect, or validated profit forecast.",
      ...(references.geographicMatch === "partial_regional" ? ["Only rows explicitly matched to the USDA ERS resource region are included in the local ranking; national fallback rows remain separate reference values."] : []),
      ...(area === null ? ["No positive compatible field area was provided; whole-field totals are omitted."] : []),
      ...(rows.some((row) => row.netReturnUsdHa === null) ? ["Net return and rankings are omitted for crops missing a complete yield, price, or total cost value."] : []),
    ],
  };
}
