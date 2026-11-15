import type { AnalyzeResult, OptionsResult } from "./clovis";
import type { FieldConditionsResult } from "./field-conditions";

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
}

export interface MeridianChatRequest {
  messages: MeridianChatMessage[];
  context: MeridianChatContext;
}

export type MeridianChatToolName = "getFieldConditions" | "getPredictionOptions" | "runClovisComparison";

export type MeridianToolResult = FieldConditionsResult | OptionsResult | AnalyzeResult;

export type MeridianToolResultEnvelope<T = MeridianToolResult> =
  | { ok: true; result: T }
  | { ok: false; error: string };
