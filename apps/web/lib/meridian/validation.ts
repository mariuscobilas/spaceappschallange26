import { z } from "zod";
import type { AnalyzePayload, MeridianChatRequest } from "@spaceapps/shared";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real calendar date (YYYY-MM-DD).");

const planContextSchema = z.strictObject({
  coverCrop: z.string().min(1).max(40),
  terminationDays: z.number().int().min(0).max(60),
  plantingDate: z.union([z.literal(""), calendarDate]),
  areaHa: z.string().max(40),
  notes: z.string().max(4000),
  status: z.enum(["draft", "saved"]),
});

export const chatContextSchema = z.strictObject({
  latitude: z.number().min(24).max(50),
  longitude: z.number().min(-125).max(-66),
  locationName: z.string().min(1).max(200),
  fieldId: z.string().min(1).max(200).optional(),
  crop: z.string().min(1).max(40),
  observationDate: calendarDate.refine((date) => date >= "1981-01-01" && date <= new Date().toISOString().slice(0, 10),
    "Observation date must be between 1981-01-01 and today."),
  plan: planContextSchema.optional(),
});

export const chatRequestSchema: z.ZodType<MeridianChatRequest> = z.strictObject({
  messages: z.array(z.strictObject({
    id: z.string().min(1).max(200),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.strictObject({ type: z.literal("text"), text: z.string().min(1).max(16000) })).min(1).max(8),
  })).min(1).max(40),
  context: chatContextSchema,
});

// Mirror the existing Clovis request contract; FastAPI remains authoritative.
const scenarioSchema = z.strictObject({
  site_id: z.literal("clovis_nm").optional(),
  decision_date: calendarDate,
  initial_soil_moisture_m3_m3: z.number().min(0).max(1).nullable().optional(),
  cover_crop: z.enum(["pea", "oat", "six_species_mix"]),
  cover_planting_date: calendarDate,
  cover_termination_date: calendarDate,
  next_crop: z.literal("winter_wheat").optional(),
  next_crop_planting_date: calendarDate,
  irrigation_schedule: z.array(z.strictObject({ date: calendarDate, amount_mm: z.number().min(0).max(10000) })).max(365).optional(),
}).superRefine((s, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!(s.decision_date <= s.cover_planting_date && s.cover_planting_date < s.cover_termination_date && s.cover_termination_date < s.next_crop_planting_date)) {
    fail("Require decision <= cover planting < termination < winter-wheat planting.");
  }
  const horizon = (Date.parse(s.next_crop_planting_date) - Date.parse(s.decision_date)) / 86400000;
  if (horizon < 7 || horizon > 365 || s.decision_date < "2001-01-01" || s.next_crop_planting_date > "2100-12-31") fail("Use a 7–365 day scenario in years 2001–2100.");
  if (!(s.cover_planting_date.slice(0, 4) === s.cover_termination_date.slice(0, 4) && s.cover_planting_date.slice(0, 4) === s.next_crop_planting_date.slice(0, 4)) ||
      ![2, 3, 4].includes(Number(s.cover_planting_date.slice(5, 7))) ||
      ![5, 6].includes(Number(s.cover_termination_date.slice(5, 7))) ||
      ![9, 10, 11].includes(Number(s.next_crop_planting_date.slice(5, 7)))) fail("Clovis supports spring cover planting (February–April), May–June termination and September–November wheat planting in the same year.");
  const events = s.irrigation_schedule ?? [];
  if (new Set(events.map((event) => event.date)).size !== events.length || events.some((event) => event.date <= s.decision_date || event.date > s.next_crop_planting_date)) fail("Irrigation dates must be unique and after the decision date through wheat planting.");
});

const money = z.number().min(0).max(1_000_000);
const economicsSchema = z.strictObject({
  currency: z.literal("USD").optional(),
  baseline_wheat_yield_t_ha: z.number().min(0).max(100).optional(),
  wheat_price_usd_t: money.optional(),
  moisture_to_yield_sensitivity: z.number().min(0).max(10).optional(),
  max_relative_yield_change: z.number().min(0).max(1).optional(),
  seed_cost_usd_ha: money.optional(), establishment_cost_usd_ha: money.optional(),
  termination_cost_usd_ha: money.optional(), additional_cost_usd_ha: money.optional(),
  net_cover_revenue_usd_ha: z.number().min(-1_000_000).max(1_000_000).optional(), incentive_usd_ha: money.optional(),
});

export const analyzePayloadSchema: z.ZodType<AnalyzePayload> = z.strictObject({
  scenario: scenarioSchema,
  area_ha: z.number().gt(0).max(1_000_000).optional(),
  economics: economicsSchema.optional(),
  risk_rules: z.strictObject({
    moderate_relative_moisture_loss: z.number().gt(0).lt(1).optional(),
    high_relative_moisture_loss: z.number().gt(0).max(1).optional(),
  }).refine((rules) => (rules.moderate_relative_moisture_loss ?? 0.05) < (rules.high_relative_moisture_loss ?? 0.15), "Moderate risk threshold must be below high risk threshold.").optional(),
  include_daily_trajectory: z.boolean().optional(),
});
