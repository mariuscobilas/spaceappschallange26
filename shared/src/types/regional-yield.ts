/** County summaries of published historical model outputs; never farm forecasts or returns. */
export type RegionalYieldCrop = "corn" | "soybeans";
export type RegionalYieldPeriod = "2019" | "2020" | "2019-2020";
export interface RegionalYieldEstimate {
  crop: RegionalYieldCrop;
  period: RegionalYieldPeriod;
  sampleRecords: number;
  sampleRecordsByYear: { "2019": number; "2020": number };
  meanYieldEffectPct: number;
}
export type RegionalYieldGeometry = {
  type: "Polygon"; coordinates: number[][][];
} | {
  type: "MultiPolygon"; coordinates: number[][][][];
};
export interface RegionalYieldRegion {
  fips: string;
  name: string;
  state: "IA" | "IL" | "IN" | "MI" | "MO" | "OH";
  centroid: [number, number];
  geometry: RegionalYieldGeometry;
  estimates: RegionalYieldEstimate[];
}
export interface RegionalYieldDataset {
  status: "available" | "unavailable";
  message: string;
  datasetId: string | null;
  generatedAt: string | null;
  source: {
    title: string;
    url: string;
    doi: string;
    archiveSha256: string;
    license: string;
  } | null;
  method: {
    summary: string;
    units: "percent";
    sampleUnit: "model sample record";
    minimumSampleRecords: number;
    interpretation: string;
    limitations: string[];
  } | null;
  regions: RegionalYieldRegion[];
}
