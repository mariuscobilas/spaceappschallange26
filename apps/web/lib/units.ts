export type UnitSystem = "metric" | "us";
export type EconomicsUnitKey =
  | "grainPrice"
  | "baselineYield"
  | "seedCost"
  | "terminationCost"
  | "subsidy"
  | "areaHa";

export const HECTARES_TO_ACRES = 2.4710538147;
const POUNDS_PER_KILOGRAM = 2.20462262185;
const POUNDS_PER_TONNE = 1000 * POUNDS_PER_KILOGRAM;
// Standard weights from USDA NASS Price Program methodology (wheat/soy 60 lb/bu;
// corn 56 lb/bu) and USDA ERS Feed Grains Database (sorghum 56 lb/bu).
// https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Prices/Price_Program_Methodology_v10.pdf
// https://www.ers.usda.gov/data-products/feed-grains-database/documentation
const BUSHEL_POUNDS: Record<string, number> = {
  wheat: 60,
  corn: 56,
  soybeans: 60,
  sorghum: 56,
};

// Cotton's U.S. yield and price use lint pounds: USDA NASS cotton ginnings
// reports lint yield in pounds per acre. Metric storage represents that same
// lint weight in tonnes/hectare; seed cotton is not included.
// https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Cotton_Ginnings/index.php

export function formatArea(ha: number, system: UnitSystem): string {
  const value = system === "us" ? ha * HECTARES_TO_ACRES : ha;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${system === "us" ? "ac" : "ha"}`;
}

/** Convert a displayed input to the stable metric values used by economicsDraft. */
export function toCanonicalEconomicsValue(
  key: EconomicsUnitKey,
  value: number,
  system: UnitSystem,
  crop: string,
): number {
  if (system === "metric") return value;
  if (key === "areaHa") return value / HECTARES_TO_ACRES;
  if (["seedCost", "terminationCost", "subsidy"].includes(key)) return value * HECTARES_TO_ACRES;
  const bushelWeight = BUSHEL_POUNDS[crop];
  if (key === "grainPrice") return bushelWeight ? value * POUNDS_PER_TONNE / bushelWeight : value * POUNDS_PER_TONNE;
  if (key === "baselineYield") {
    const poundsPerAcre = bushelWeight ? value * bushelWeight : value;
    return (poundsPerAcre / POUNDS_PER_KILOGRAM) / (1 / HECTARES_TO_ACRES) / 1000;
  }
  return value;
}

/** Convert stable metric economicsDraft values to the selected display units. */
export function fromCanonicalEconomicsValue(
  key: EconomicsUnitKey,
  value: number,
  system: UnitSystem,
  crop: string,
): number {
  if (system === "metric") return value;
  if (key === "areaHa") return value * HECTARES_TO_ACRES;
  if (["seedCost", "terminationCost", "subsidy"].includes(key)) return value / HECTARES_TO_ACRES;
  const bushelWeight = BUSHEL_POUNDS[crop];
  if (key === "grainPrice") return bushelWeight ? value * bushelWeight / POUNDS_PER_TONNE : value / POUNDS_PER_TONNE;
  if (key === "baselineYield") {
    const poundsPerAcre = value * 1000 * POUNDS_PER_KILOGRAM / HECTARES_TO_ACRES;
    return bushelWeight ? poundsPerAcre / bushelWeight : poundsPerAcre;
  }
  return value;
}

export function economicsUnitLabel(key: EconomicsUnitKey, system: UnitSystem, crop: string): string {
  if (system === "metric") return ({ grainPrice: "USD/tonne", baselineYield: "tonnes/ha", seedCost: "USD/ha", terminationCost: "USD/ha", subsidy: "USD/ha", areaHa: "ha" })[key];
  if (key === "areaHa") return "ac";
  if (["seedCost", "terminationCost", "subsidy"].includes(key)) return "USD/ac";
  if (key === "grainPrice") return BUSHEL_POUNDS[crop] ? "USD/bu" : "USD/lb";
  return BUSHEL_POUNDS[crop] ? "bu/ac" : "lb/ac";
}
