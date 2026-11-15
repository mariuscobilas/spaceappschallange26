import type { AnalyzeResult, OptionsResult } from "./clovis";
import type { FieldConditionsResult } from "./field-conditions";
import type { SoilProfileResult } from "./soil-profile";

export interface MeridianChatTextPart {
  type: "text";
  text: string;
}

/** Client submitted history uses the AI SDK UI message shape, with text only. */
export interface MeridianChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MeridianChatTextPart[];
}

export interface MeridianChatPlanContext {
  coverCrop: string;
  terminationDays: number;
  plantingDate: string;
  /** Preferred explicit name; plantingDate remains for older clients. */
  cashCropPlantingDate?: string;
  id?: string;
  name?: string;
  crop?: string;
  budget?: Partial<Record<"grainPrice" | "baselineYield" | "yieldChange" | "seedCost" | "terminationCost" | "subsidy" | "areaHa", string>>;
  areaHa: string;
  notes: string;
  status: "draft" | "saved";
}

export interface MeridianChatContext {
  latitude: number;
  longitude: number;
  locationName: string;
  fieldId?: string;
  crop: string;
  observationDate: string;
  plan?: MeridianChatPlanContext;
  contextVersion?: string;
  displayUnits?: "metric" | "us";
  areaHa?: number | null;
  areaSource?: "boundary" | "field" | "plan" | "unknown";
  activePlan?: { id?: string; name?: string; crop: string; budget?: Partial<Record<"grainPrice" | "baselineYield" | "yieldChange" | "seedCost" | "terminationCost" | "subsidy" | "areaHa", string>> };
  planStatus?: "draft" | "saved" | "none";
  calendarStatus?: "complete" | "incomplete" | "unknown";
  budgetStatus?: "complete" | "incomplete" | "unknown";
  budgetState?: "draft" | "saved" | "none";
  economicsDraft?: Partial<Record<"grainPrice" | "baselineYield" | "yieldChange" | "seedCost" | "terminationCost" | "subsidy" | "areaHa", string>>;
  savedAlternatives?: Array<{ id?: string; name?: string; crop: string; coverCrop: string; terminationDays: number; cashCropPlantingDate: string; areaHa: string; budget?: Partial<Record<"grainPrice" | "baselineYield" | "yieldChange" | "seedCost" | "terminationCost" | "subsidy" | "areaHa", string>> }>;
  planningYear?: number;
  irrigation?: { status: "available" | "unavailable" | "unknown"; summary?: string };
}

export interface MeridianChatRequest {
  messages: MeridianChatMessage[];
  context: MeridianChatContext;
}

export interface MeridianSeasonFactsUpdate {
  fieldId: string; planningYear: number; irrigation: { status: "available" | "unavailable" | "unknown" };
  sourceMessageId: string; contextVersion: string; sourceQuote?: string;
}
export interface MeridianPlanProposal {
  id: string; fieldId: string; contextVersion: string;
  changes: { crop?: string; coverCrop?: string; cashCropPlantingDate?: string; terminationDays?: number; areaHa?: string; notes?: string; budget?: Partial<Record<"grainPrice" | "baselineYield" | "yieldChange" | "seedCost" | "terminationCost" | "subsidy" | "areaHa", string>> };
}

export interface MeridianFieldEvidenceResult {
  conditions: MeridianToolResultEnvelope<FieldConditionsResult>;
  soil: MeridianToolResultEnvelope<SoilProfileResult>;
  interpretation: string;
}

export interface MeridianCropReferenceRow {
  crop: string; yieldTHa: number | null; priceUsdT: number | null; totalCostUsdHa: number | null;
  sourceRegion: string; sourceYear: number; geographicMatch: "regional" | "national_fallback";
  units: string; sourceUrl: string;
}
export interface MeridianCropReferencesResult {
  referenceYear: number; geographicMatch: "regional" | "partial_regional" | "national_fallback";
  geographicRegion: string | null; countyFips: string | null; rows: MeridianCropReferenceRow[];
  provenance: Array<{ crop: string; sourceUrl: string; retrievedAt: string; sha256: string; rawBytes: number; snapshotPath?: string }>;
  assumptions: string[]; status: "available" | "stale_fallback"; message: string;
}
export interface MeridianCropComparisonRow {
  crop: string; yieldTHa: number | null; priceUsdT: number | null; totalCostUsdHa: number | null;
  grossRevenueUsdHa: number | null; netReturnUsdHa: number | null; wholeFieldNetReturnUsd: number | null;
  wholeFieldGrossRevenueUsd: number | null; breakEvenPriceUsdT: number | null; breakEvenYieldTHa: number | null;
  sourceYear: number | null; sourceRegion: string | null; geographicMatch: "regional" | "national_fallback";
  provenance: string; inputBasis: string[];
}
export interface MeridianCropComparisonResult {
  planningYear: number; referenceYear: number;
  geographicMatch: "regional" | "partial_regional" | "national_fallback";
  geographicRegion: string | null; countyFips: string | null; referenceStatus: "available" | "stale_fallback";
  referenceMessage: string; provenance: MeridianCropReferencesResult["provenance"];
  rows: MeridianCropComparisonRow[]; ranking: string[]; assumptions: string[];
}

export type MeridianChatToolName = "getFieldEvidence" | "getCropReferences" | "compareCropScenarios" | "getPredictionOptions" | "runClovisComparison" | "rememberSeasonFacts" | "preparePlanDraft";

export type MeridianToolResult = MeridianFieldEvidenceResult | MeridianCropReferencesResult | MeridianCropComparisonResult |
  MeridianSeasonFactsUpdate | MeridianPlanProposal | FieldConditionsResult | OptionsResult | AnalyzeResult;

export type MeridianToolResultEnvelope<T = MeridianToolResult> =
  | { ok: true; result: T }
  | { ok: false; error: string };
