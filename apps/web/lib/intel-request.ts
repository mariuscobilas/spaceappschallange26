import type { FieldConditionsResult } from "@spaceapps/shared";

export function describeConditions(result?: FieldConditionsResult) {
  if (!result) return "Field conditions: unavailable (not yet retrieved).";
  const measures = [
    ["30-day precipitation", result.precipitation30d, "mm"],
    ["Root-zone wetness", result.rootZoneWetness, "%"],
    ["Available water storage capacity", result.availableWaterStorage, "mm"],
  ] as const;
  return [
    `Field conditions requested for ${result.requestedDate}; retrieved ${result.retrievedAt}.`,
    `Sample coordinates: ${result.sample.latitude.toFixed(5)}, ${result.sample.longitude.toFixed(5)} (point/grid sample, not a field-wide measurement).`,
    ...measures.map(([label, measure, unit]) => {
      const period = label === "Available water storage capacity" && measure.status === "available"
        ? "current soil survey mapping; no observation period"
        : measure.periodStart && measure.periodEnd
        ? `${measure.periodStart} to ${measure.periodEnd}`
        : "period unavailable";
      const value = measure.status === "available" && measure.value !== null
        ? `${label === "Root-zone wetness" ? Math.round(measure.value * 100) : measure.value} ${unit}`
        : "Unavailable";
      return `${label}: ${value}; period: ${period}; source: ${measure.source} (${measure.sourceUrl}); resolution: ${measure.spatialResolution}; ${measure.message}`;
    }),
    `Soil map unit: ${result.soilMapUnit ?? "unavailable"}. Storage is mapped capacity, not current water remaining; gridded readings are not field-wide measurements.`,
  ].join("\n" );
}
