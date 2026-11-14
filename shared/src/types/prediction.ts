/**
 * Field Shift model inference and agricultural adaptation contracts.
 */

import type { CropType, FieldProfile } from "./field";
import type { NasaEnvironmentalSnapshot } from "./nasa";

export type ClimateRiskLevel = "low" | "medium" | "high" | "critical";

export interface ClimateRiskFactor {
  id: string;
  name: string;
  category: "heat_stress" | "drought" | "waterlogging" | "frost_shift" | "pest_disease";
  level: ClimateRiskLevel;
  impactScore: number; // 0 - 100
  description: string;
  mitigationAdvice: string;
}

export interface CropShiftOption {
  crop: CropType;
  cropName: string;
  suitabilityScore: number; // 0 - 100
  expectedYieldDeltaPct: number; // e.g. +14% or -5%
  waterDemandRating: "very_low" | "low" | "moderate" | "high";
  heatToleranceRating: "poor" | "moderate" | "good" | "excellent";
  estimatedTransitionCostUsdPerHa: number;
  paybackPeriodYears: number;
  recommendationReason: string;
}

export interface AdaptationAction {
  id: string;
  stepNumber: number;
  phase: "immediate_season" | "next_year" | "long_term";
  title: string;
  action: string;
  timeframe: string;
  estimatedCostEstimateUsd?: number;
  expectedBenefit: string;
}

export interface FieldShiftPrediction {
  predictionId: string;
  fieldId: string;
  generatedAt: string; // ISO 8601
  modelVersion: string;
  confidenceScore: number; // 0.0 to 1.0

  // Risk assessment for current configuration
  vulnerabilityScore: number; // 0 (resilient) - 100 (high risk)
  primaryRiskSummary: string;
  riskFactors: ClimateRiskFactor[];

  // Recommended shifts & alternatives
  recommendedCrops: CropShiftOption[];
  suggestedPlantingWindowShiftDays: number; // e.g. -14 (plant 2 weeks earlier) or +7
  recommendedIrrigationAdjustment: string;

  // Step-by-step adaptation roadmap
  actionPlan: AdaptationAction[];
}

export interface FieldAnalysisRequest {
  field: FieldProfile;
  nasaOverride?: Partial<NasaEnvironmentalSnapshot>;
  planningHorizonYears?: number; // 1, 3, 5, or 10 years
}

export interface FieldAnalysisResponse {
  fieldId: string;
  fieldName: string;
  environmentSnapshot: NasaEnvironmentalSnapshot;
  prediction: FieldShiftPrediction;
}

