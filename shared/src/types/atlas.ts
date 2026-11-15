/** A validated, source-backed regional dataset. No fixture/demo data is served as an available result. */
import type { CropType } from "./field";

export interface AtlasDataset {
  status: "available" | "unavailable";
  message: string;
  datasetId: string | null;
  generatedAt: string | null;
  validation: {
    status: "validated";
    method: string;
    reference: string;
  } | null;
  scenarios: AtlasScenario[];
  cells: AtlasCell[];
  provenance: AtlasProvenance[];
}

export interface AtlasScenario {
  id: string;
  label: string;
  baseline: string;
  periodStart: string;
  periodEnd: string;
}

export interface AtlasCell {
  h3Index: string;
  crop: Extract<CropType, "wheat" | "corn" | "soybeans" | "cotton" | "sorghum">;
  scenarioId: string;
  activeAreaHa: number | null;
  netReturnUsdHa: number | null;
  yieldPenaltyPct: number | null;
  rootZoneWetness: number | null;
  soilTexture: string | null;
}

export interface AtlasProvenance {
  title: string;
  url: string;
  periodStart?: string;
  periodEnd?: string;
  spatialMeaning: string;
}
