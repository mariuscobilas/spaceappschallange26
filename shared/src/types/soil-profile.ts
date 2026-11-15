import type { GeoCoordinate } from "./field";

export interface SoilMeasure {
  status: "available" | "unavailable";
  value: number | string | null;
  unit: string;
  source: string;
  sourceUrl: string;
  message: string;
}

export interface SoilHorizon {
  topCm: number;
  bottomCm: number;
  texture: SoilMeasure;
  sandPct: SoilMeasure;
  siltPct: SoilMeasure;
  clayPct: SoilMeasure;
  organicMatterPct: SoilMeasure;
  bulkDensityGcm3: SoilMeasure;
  ph: SoilMeasure;
  saturatedConductivityUmS: SoilMeasure;
}

export interface SoilProfileComponent {
  mapUnitSymbol: string;
  mapUnitName: string;
  componentName: string;
  componentPercent: number | null;
  drainageClass: SoilMeasure;
  hydrologicGroup: SoilMeasure;
  horizons: SoilHorizon[];
}

export interface SoilProfileResult {
  status: "available" | "unavailable";
  message: string;
  sample: GeoCoordinate;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
  components: SoilProfileComponent[];
}
