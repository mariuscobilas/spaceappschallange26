import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AnalyzeResult, FieldConditionsResult, MeridianChatContext, MeridianToolResultEnvelope, OptionsResult } from "@spaceapps/shared";
import { analyzePayloadSchema, chatContextSchema } from "./validation";

// Check the shapes consumed by chat before allowing upstream JSON into result cards.
const measure = z.object({ status: z.enum(["available", "unavailable"]), value: z.number().nullable(), unit: z.string(), periodStart: z.string().nullable(), periodEnd: z.string().nullable(), source: z.string(), sourceUrl: z.string(), spatialResolution: z.string(), message: z.string() });
const conditionsResponse = z.object({ sample: z.object({ latitude: z.number(), longitude: z.number() }), requestedDate: z.string(), retrievedAt: z.string(), precipitation30d: measure, rootZoneWetness: measure, availableWaterStorage: measure, soilMapUnit: z.string().nullable() });
const choice = z.object({ id: z.string(), label: z.string() });
const optionsResponse = z.object({ sites: z.array(choice), cover_crops: z.array(choice), next_crops: z.array(choice), calendar: z.object({ cover_planting_months: z.array(z.number()), cover_termination_months: z.array(z.number()), wheat_planting_months: z.array(z.number()) }), notes: z.array(z.string()), default_economics: z.record(z.string(), z.unknown()), default_risk_rules: z.record(z.string(), z.number()) });
const analysisResponse = z.object({
  execution_mode: z.literal("computed"), status: z.literal("experimental"),
  request: z.object({ scenario: z.object({ cover_crop: z.string(), next_crop: z.string(), decision_date: z.string(), cover_planting_date: z.string(), cover_termination_date: z.string(), next_crop_planting_date: z.string(), irrigation_schedule: z.array(z.object({ date: z.string(), amount_mm: z.number() })) }), area_ha: z.number(), economics: z.record(z.string(), z.unknown()), risk_rules: z.record(z.string(), z.number()) }),
  model: z.object({ name: z.string(), status: z.string(), artifact_sha256: z.string(), seasonal_validation_status: z.string() }),
  sensor_depth_cm: z.literal(5), moisture_unit: z.literal("m3/m3"), moisture_temporal_resolution: z.literal("daily_average"),
  initial_moisture: z.object({ value_m3_m3: z.number(), source: z.string(), source_dates: z.array(z.string()) }),
  weather: z.object({ history_start_date: z.string(), history_end_date: z.string() }),
  scenarios: z.array(z.object({
    scenario: z.enum(["dry", "typical", "very_rainy"]),
    moisture: z.object({ cover_at_planting_m3_m3: z.number(), fallow_at_planting_m3_m3: z.number(), cover_final_7_day_average_m3_m3: z.number(), fallow_final_7_day_average_m3_m3: z.number(), final_7_day_difference_m3_m3: z.number() }),
    water_risk: z.object({ level: z.string() }), quality: z.object({ reliability: z.string(), usable_for_recommendation: z.boolean(), flags: z.array(z.string()) }),
    finances: z.object({ incremental_net_benefit_usd_ha: z.number().nullable(), incremental_net_benefit_usd_total: z.number().nullable(), interpretation: z.string() }),
  })).length(3),
  recommendation: z.object({ decision: z.string(), message: z.string(), status: z.string(), validated: z.literal(false), reason_codes: z.array(z.string()) }),
  financial_summary: z.object({ minimum_incremental_net_benefit_usd_ha: z.number().nullable(), maximum_incremental_net_benefit_usd_ha: z.number().nullable(), calculated_cases: z.number(), case_count: z.number() }),
  assumptions: z.array(z.string()),
});

export function createMeridianTools(context: MeridianChatContext, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  const field = chatContextSchema.parse(context);
  const base = (process.env.API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

  async function request<T>(path: string, schema: z.ZodType, body?: unknown): Promise<MeridianToolResultEnvelope<T>> {
    try {
      const response = await fetcher(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        const message = typeof result?.error?.message === "string" ? result.error.message : typeof result?.detail === "string" ? result.detail : `Prediction service returned HTTP ${response.status}.`;
        return { ok: false, error: message.slice(0, 500) };
      }
      if (!schema.safeParse(result).success) return { ok: false, error: "Prediction service returned an invalid response. Please retry; no prediction was accepted." };
      return { ok: true, result: result as T };
    } catch {
      return { ok: false, error: signal?.aborted ? "The request was stopped or timed out." : "The local prediction service is unavailable. Start FastAPI and retry." };
    }
  }

  return {
    getFieldConditions: createTool({
      id: "getFieldConditions",
      description: "Read observations for the selected field location and observation date. Preserve source, units and unavailable states. These are selected-location context, never Clovis initial 5 cm moisture inputs.",
      inputSchema: z.strictObject({}),
      execute: async () => request<FieldConditionsResult>(`/api/v1/field-conditions?${new URLSearchParams({ latitude: String(field.latitude), longitude: String(field.longitude), as_of: field.observationDate })}`, conditionsResponse),
    }),
    getPredictionOptions: createTool({
      id: "getPredictionOptions",
      description: "Get supported Clovis crops, calendar limits, default economic/risk assumptions and model notes. Example inputs are examples, not user choices; do not silently adopt their dates.",
      inputSchema: z.strictObject({}),
      execute: async () => request<OptionsResult>("/api/v1/options", optionsResponse),
    }),
    runClovisComparison: createTool({
      id: "runClovisComparison",
      description: "Run the local Clovis reference model for pea/oat/specific six-species mix versus fallow before winter wheat, with supplied dates. Ask for missing dates and initial 5 cm daily-average volumetric moisture or agreement to use the historical default first. Results are experimental reference simulations, not selected-field predictions or validated planting advice.",
      inputSchema: analyzePayloadSchema,
      execute: async (input) => {
        const parsed = analyzePayloadSchema.safeParse(input);
        if (!parsed.success) return { ok: false as const, error: parsed.error.issues.map((issue) => issue.message).join(" ") };
        // Daily trajectories are unnecessary for chat and make tool context excessively large.
        const response = await request<AnalyzeResult>("/api/v1/analyze", analysisResponse, { ...parsed.data, include_daily_trajectory: false });
        if (!response.ok) return response;

        // Do not pass the backend's provisional directive to the model as advice.
        // Keep quality flags and the numerical diagnostic fields intact.
        const result: AnalyzeResult = {
          ...response.result,
          assumptions: [...response.result.assumptions, "Meridian withheld the backend's provisional unvalidated directive and replaced it with an insufficient-evidence notice; this is a safety annotation, not a new model prediction."],
          recommendation: {
            ...response.result.recommendation,
            decision: "insufficient_evidence",
            message: "Insufficient evidence for a planting recommendation.",
            reason_codes: response.result.recommendation.reason_codes.filter((code) => code !== "positive_incremental_return_in_all_cases"),
          },
        };
        return { ok: true as const, result };
      },
    }),
  };
}
