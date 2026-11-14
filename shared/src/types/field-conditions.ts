import type { GeoCoordinate } from "./field";

/** Numeric context from an identified source; unavailable is never treated as zero. */
export interface FieldConditionMeasure {
  status: "available" | "unavailable";
  value: number | null;
  unit: "mm" | "fraction";
  periodStart: string | null;
  periodEnd: string | null;
  source: string;
  sourceUrl: string;
  spatialResolution: string;
  message: string;
}

/** Point/grid and mapped soil context, not field-average observations or predictions. */
export interface FieldConditionsResult {
  sample: GeoCoordinate;
  requestedDate: string;
  retrievedAt: string;
  /** Complete contiguous 30-day precipitation total ending on an actual available day. */
  precipitation30d: FieldConditionMeasure;
  /** Relative saturation, 0–1, in the model's 0–100 cm root zone; not volumetric content. */
  rootZoneWetness: FieldConditionMeasure;
  /** Mapped available water storage capacity, 0–100 cm; not current water remaining. */
  availableWaterStorage: FieldConditionMeasure;
  soilMapUnit: string | null;
}
