import type { UIMessage } from "ai";

export interface IntelConversation {
  id: string;
  messages: UIMessage[];
}

const STORAGE_PREFIX = "meridian.intel-conversation.v1:";
const conversations = new Map<string, IntelConversation>();
const conversationIssues = new Map<string, string>();
const makeId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isNullableNumber = (value: unknown) => value === null || isFiniteNumber(value);
function validClovisResult(value: Record<string, unknown>) {
  const request = value.request, model = value.model, initial = value.initial_moisture, recommendation = value.recommendation, summary = value.financial_summary;
  if (!isRecord(request) || !isRecord(request.scenario) || !isRecord(request.economics) || !isRecord(request.risk_rules) || !isRecord(model) || !isRecord(initial) || !isRecord(recommendation) || !isRecord(summary)) return false;
  if (!["execution_mode", "moisture_unit", "moisture_temporal_resolution"].every((key) => typeof value[key] === "string") || !isFiniteNumber(value.sensor_depth_cm) || typeof model.name !== "string" || typeof model.status !== "string" || typeof model.seasonal_validation_status !== "string" || !isNullableNumber(model.validation_mae_m3_m3) || !isNullableNumber(model.persistence_validation_mae_m3_m3)) return false;
  if (!isNullableNumber(initial.value_m3_m3) || !Array.isArray(initial.source_dates) || !initial.source_dates.every((date) => typeof date === "string")) return false;
  if (typeof recommendation.validated !== "boolean" || typeof recommendation.status !== "string" || !Array.isArray(recommendation.reason_codes) || !recommendation.reason_codes.every((code) => typeof code === "string")) return false;
  if (!["minimum_incremental_net_benefit_usd_ha", "maximum_incremental_net_benefit_usd_ha"].every((key) => isNullableNumber(summary[key])) || !isFiniteNumber(summary.calculated_cases) || !isFiniteNumber(summary.case_count)) return false;
  if (!Array.isArray(value.assumptions) || !value.assumptions.every((line) => typeof line === "string") || !Array.isArray(value.scenarios) || value.scenarios.length !== 3) return false;
  return value.scenarios.every((scenario) => {
    if (!isRecord(scenario) || !isRecord(scenario.moisture) || !isRecord(scenario.water_risk) || !isRecord(scenario.quality) || !isRecord(scenario.finances)) return false;
    const moisture = scenario.moisture, waterRisk = scenario.water_risk, quality = scenario.quality, finances = scenario.finances;
    const moistureKeys = ["cover_at_planting_m3_m3", "fallow_at_planting_m3_m3", "final_7_day_difference_m3_m3"];
    return typeof scenario.scenario === "string" && moistureKeys.every((key) => isNullableNumber(moisture[key])) && typeof waterRisk.level === "string" && typeof quality.reliability === "string" && typeof quality.usable_for_recommendation === "boolean" && Array.isArray(quality.flags) && quality.flags.every((flag) => typeof flag === "string") && isNullableNumber(finances.fallow_wheat_yield_t_ha) && isNullableNumber(finances.cover_wheat_yield_t_ha) && isNullableNumber(finances.incremental_net_benefit_usd_ha);
  });
}
function validToolPart(part: Record<string, unknown>): boolean {
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return true;
  if (typeof part.state !== "string" || !["input-streaming", "input-available", "output-available", "output-error"].includes(part.state)) return false;
  if (part.state !== "output-available") return part.state !== "output-error" || typeof part.errorText === "string";
  if (!isRecord(part.output) || typeof part.output.ok !== "boolean") return false;
  if (!part.output.ok) return typeof part.output.error === "string";
  const result = part.output.result;
  if (!isRecord(result)) return false;
  const name = part.type.slice(5);
  if (name === "preparePlanDraft") return typeof result.id === "string" && typeof result.fieldId === "string" && typeof result.contextVersion === "string" && isRecord(result.changes) && Object.keys(result.changes).length > 0;
  if (name === "rememberSeasonFacts") return typeof result.fieldId === "string" && Number.isInteger(result.planningYear) && typeof result.sourceMessageId === "string" && typeof result.contextVersion === "string" && (result.sourceQuote === undefined || typeof result.sourceQuote === "string") && isRecord(result.irrigation) && ["available", "unavailable", "unknown"].includes(String(result.irrigation.status));
  if (name === "compareCropScenarios") return Array.isArray(result.rows) && result.rows.every(isRecord) && Array.isArray(result.ranking) && Array.isArray(result.assumptions);
  if (name === "getCropReferences") return Array.isArray(result.rows) && result.rows.every(isRecord) && Array.isArray(result.provenance) && result.provenance.every(isRecord);
  if (name === "getPredictionOptions") return ["sites", "cover_crops", "next_crops", "notes"].every((key) => Array.isArray(result[key])) && ["sites", "cover_crops", "next_crops"].every((key) => (result[key] as unknown[]).every(isRecord)) && isRecord(result.calendar);
  if (name === "getFieldEvidence") return isRecord(result.conditions) && isRecord(result.soil);
  if (name === "runClovisComparison") return validClovisResult(result);
  return true;
}

function validMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Partial<UIMessage>;
  if (typeof message.id !== "string" || message.id.length === 0 || message.id.length > 200 || (message.role !== "user" && message.role !== "assistant") || !Array.isArray(message.parts) || message.parts.length > 100) return false;
  return message.parts.every((part) => {
    if (!part || typeof part !== "object" || typeof (part as { type?: unknown }).type !== "string" || (part as { type: string }).type.length > 100 || !validToolPart(part as Record<string, unknown>)) return false;
    const text = (part as { type: string; text?: unknown }).text;
    return part.type !== "text" || typeof text === "string" && text.length <= (message.role === "user" ? 4000 : 40_000);
  });
}

function readConversation(key: string): IntelConversation | undefined {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return undefined;
    if (raw.length > 2_000_000) { conversationIssues.set(key, "Saved chat history was too large to reopen; a new conversation started."); return undefined; }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { conversationIssues.set(key, "Saved chat history could not be read; a new conversation started."); return undefined; }
    const value = parsed as Partial<IntelConversation>;
    if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 200 || !Array.isArray(value.messages) || value.messages.length > 200 || !value.messages.every(validMessage)) {
      conversationIssues.set(key, "Saved chat history was incomplete or malformed; a new conversation started.");
      return undefined;
    }
    conversationIssues.delete(key);
    return { id: value.id, messages: value.messages };
  } catch {
    conversationIssues.set(key, "Saved chat history could not be read; a new conversation started.");
    return undefined;
  }
}

export function getConversationIssue(key: string): string | undefined {
  try { localStorage.getItem(`${STORAGE_PREFIX}${key}`); }
  catch { return "Browser storage is unavailable; chat history is saved for this session only."; }
  return conversationIssues.get(key);
}

export function getConversation(key: string): IntelConversation {
  const current = conversations.get(key);
  if (current) return current;
  const restored = typeof window === "undefined" ? undefined : readConversation(key);
  const conversation = restored ?? { id: makeId(), messages: [] };
  conversations.set(key, conversation);
  return conversation;
}

export function saveConversation(key: string, conversation: IntelConversation): boolean {
  if (conversations.get(key)?.id !== conversation.id) return false;
  conversations.set(key, conversation);
  try {
    const serialized = JSON.stringify(conversation);
    // Never replace a readable durable copy with a snapshot restore would reject.
    // The full conversation remains available in memory and the caller warns.
    if (conversation.messages.length > 200 || serialized.length > 2_000_000 || !conversation.messages.every(validMessage)) return false;
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
    return true;
  } catch {
    return false;
  }
}

export function startConversation(key: string): IntelConversation {
  const conversation = { id: makeId(), messages: [] };
  conversations.set(key, conversation);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(conversation));
  } catch {
    // The in-memory conversation still works when browser storage is unavailable.
  }
  return conversation;
}

export function clearConversationHistory(key: string): IntelConversation {
  return startConversation(key);
}
