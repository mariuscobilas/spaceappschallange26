import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AnalyzeResult, FieldConditionsResult, MeridianChatContext, MeridianChatMessage, MeridianToolResultEnvelope, MeridianPlanProposal, MeridianSeasonFactsUpdate, OptionsResult } from "@spaceapps/shared";
import { analyzePayloadSchema, calendarDate, chatContextSchema } from "./validation";
import { getCropReferences } from "./crop-references";
import { compareCropScenarios } from "./crop-comparison";

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

export function createMeridianTools(context: MeridianChatContext, signal?: AbortSignal, fetcher: typeof fetch = fetch, messages: MeridianChatMessage[] = []) {
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
        console.warn("Meridian evidence service rejected request", { path: path.split("?")[0], status: response.status });
        const message = typeof result?.error?.message === "string" ? result.error.message : `Prediction service returned HTTP ${response.status}. Please retry or check the service status.`;
        return { ok: false, error: message.slice(0, 500) };
      }
      if (!schema.safeParse(result).success) return { ok: false, error: "Prediction service returned an invalid response. Please retry; no prediction was accepted." };
      return { ok: true, result: result as T };
    } catch (error) {
      if (!signal?.aborted) console.error("Meridian evidence request failed", { path: path.split("?")[0], error: error instanceof Error ? error.name : "UnknownError" });
      return { ok: false, error: signal?.aborted ? "The request was stopped or timed out." : "The local prediction service is unavailable. Start FastAPI and retry." };
    }
  }

  return {
    getFieldEvidence: createTool({
      id: "getFieldEvidence",
      description: "Read selected-location weather/moisture observations and mapped soil context. These are point/grid evidence, not field-wide measurements or compatible Clovis starting moisture. Partial availability is explicit.",
      inputSchema: z.strictObject({}),
      execute: async () => {
        const query = new URLSearchParams({ latitude: String(field.latitude), longitude: String(field.longitude) });
        const [conditions, soil] = await Promise.all([
          request<FieldConditionsResult>(`/api/v1/field-conditions?${query}&as_of=${field.observationDate}`, conditionsResponse),
          request(`/api/v1/soil-profile?${query}`, z.object({ status: z.enum(["available", "unavailable"]), message: z.string(), source: z.string(), sourceUrl: z.string(), components: z.array(z.unknown()) })),
        ]);
        if (!conditions.ok && !soil.ok) return { ok: false as const, error: conditions.error };
        return { ok: true as const, result: { conditions, soil, interpretation: "Selected-point observations and mapped soil context; not plot-level forecasts or profile-water measurements." } };
      },
    }),
    getCropReferences: createTool({
      id: "getCropReferences",
      description: "Read public USDA ERS historical yield, crop price and production-cost references for supported cash crops. Source year differs from planning year. Geography and irrigation applicability are explicit. Read this before asking the user to enter reference numbers.",
      inputSchema: z.strictObject({}),
      execute: async () => {
        try { return { ok: true as const, result: await getCropReferences(field, signal, fetcher) }; }
        catch (error) {
          if (!signal?.aborted) console.error("Crop reference lookup failed", { error: error instanceof Error ? error.name : "UnknownError" });
          return { ok: false as const, error: signal?.aborted ? "The request was stopped." : "Crop references are unavailable. Your saved values remain usable; retry the reference lookup." };
        }
      },
    }),
    compareCropScenarios: createTool({
      id: "compareCropScenarios",
      description: "Calculate preliminary cash-crop revenue/net-return comparisons using USDA references plus compatible saved/draft budgets and explicit user overrides. Supply overrides only if the user stated them. Not a field yield prediction or agronomic crop recommendation. Cover seed/termination costs are additional costs, not total cash-crop production costs.",
      inputSchema: z.strictObject({ overrides: z.array(z.strictObject({ crop: z.enum(["corn", "wheat", "soybeans", "cotton", "sorghum"]), yieldTHa: z.number().min(0).max(100).optional(), priceUsdT: z.number().min(0).max(1_000_000).optional(), totalCostUsdHa: z.number().min(0).max(1_000_000).optional() })).max(5).optional() }),
      execute: async ({ overrides }) => {
        try {
          const references = await getCropReferences(field, signal, fetcher);
          return { ok: true as const, result: compareCropScenarios(field, overrides, references) };
        } catch (error) {
          if (!signal?.aborted) console.error("Crop comparison failed", { error: error instanceof Error ? error.name : "UnknownError" });
          return { ok: false as const, error: signal?.aborted ? "The request was stopped." : "The comparison could not be calculated. Check the reference data and entered values, then retry." };
        }
      },
    }),
    rememberSeasonFacts: createTool({
      id: "rememberSeasonFacts",
      description: "Remember a planning year and irrigation status explicitly stated in the latest user message for this saved field. Quote the user's exact words. Irrigation availability does not establish quantity, cost or yield. Updates are shown in the UI and saved on this device.",
      inputSchema: z.strictObject({ planningYear: z.number().int().min(1900).max(2200), irrigation: z.enum(["available", "unavailable", "unknown"]), sourceQuote: z.string().min(1).max(500) }),
      execute: async (input) => {
        const latest = messages.at(-1);
        const text = latest?.parts.map((part) => part.text).join("\n") ?? "";
        if (!field.fieldId || !field.contextVersion) return { ok: false as const, error: "Select a saved field before remembering seasonal facts." };
        if (latest?.role !== "user" || !text.includes(input.sourceQuote) || (input.planningYear !== field.planningYear && !text.includes(String(input.planningYear)))) return { ok: false as const, error: "Seasonal facts must be explicitly supported by the current user message." };
        const previousQuestion = messages.slice(0, -1).reverse().find((message) => message.role === "assistant")?.parts.map((part) => part.text).join(" ") ?? "";
        const hasIrrigationStatement = /\b(irrigat\w*|dryland|rainfed|available|unavailable)\b/i.test(input.sourceQuote);
        const isAnswerToIrrigationQuestion = /irrigat|water availability/i.test(previousQuestion) && /\b(yes|yup|yeah|no|available|unavailable)\b/i.test(input.sourceQuote);
        if (input.irrigation !== "unknown" && input.irrigation !== field.irrigation?.status && ((!hasIrrigationStatement && !isAnswerToIrrigationQuestion) || input.sourceQuote.includes("?"))) return { ok: false as const, error: "Confirm irrigation availability explicitly before remembering it." };
        const result: MeridianSeasonFactsUpdate = { fieldId: field.fieldId, contextVersion: field.contextVersion, planningYear: input.planningYear, irrigation: { status: input.irrigation }, sourceMessageId: latest.id, sourceQuote: input.sourceQuote };
        // Subsequent tools in this turn must use the just-confirmed season,
        // even before the browser persists the corresponding facts event.
        field.planningYear = input.planningYear;
        field.irrigation = { status: input.irrigation };
        return { ok: true as const, result };
      },
    }),
    preparePlanDraft: createTool({
      id: "preparePlanDraft",
      description: "Prepare a visible draft proposal for the selected field. Does not save or apply anything. The user reviews changes and clicks Apply. cashCropPlantingDate is the cash crop date; cover planting is not inferred. budget uses canonical metric strings and includes only known or explicitly labeled assumptions; empty means missing.",
      inputSchema: z.strictObject({ changes: z.strictObject({
        crop: z.enum(["corn", "wheat", "soybeans", "cotton", "sorghum"]).optional(),
        coverCrop: z.enum(["rye", "pea", "radish", "mix"]).optional(),
        cashCropPlantingDate: calendarDate.optional(), terminationDays: z.number().int().min(0).max(60).multipleOf(5).optional(),
        areaHa: z.string().max(40).refine((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 5000, "Use a positive area in hectares up to 5000.").optional(),
        notes: z.string().max(4000).optional(),
        budget: z.strictObject(Object.fromEntries(["grainPrice", "baselineYield", "yieldChange", "seedCost", "terminationCost", "subsidy", "areaHa"].map((key) => [key, z.string().max(40)]))).partial().optional(),
      }).refine((changes) => Object.keys(changes).length > 0, "Supply at least one draft change.") }),
      execute: async ({ changes }) => {
        if (!field.fieldId || !field.contextVersion) return { ok: false as const, error: "Select a saved field before preparing a plan draft." };
        const result: MeridianPlanProposal = { id: crypto.randomUUID(), fieldId: field.fieldId, contextVersion: field.contextVersion, changes };
        return { ok: true as const, result };
      },
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
