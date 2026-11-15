import type { MeridianChatContext } from "@spaceapps/shared";
import type { MeridianPlanProposal } from "@spaceapps/shared";
import { emptyEconomics, emptyPlan, validDate, validPlanDraft } from "@/lib/workspace";
import type { EconomicsDraft, FieldPlan } from "@/lib/workspace";
import type { PreviewCrop } from "@/lib/map/types";

export type SeasonFacts = { fieldId: string; planningYear: number; irrigation: "available" | "unavailable" | "unknown"; sourceMessageId: string; contextVersion: string; text: string; savedAt: string };
const FACTS_KEY = "meridian.season-facts.v1";
let memoryFacts: SeasonFacts[] = [];
let factsStorageFailed = false;
export function seasonFactsStorageAvailable() { return !factsStorageFailed; }

export function correctSeasonFact(text: string): string | null {
  const value = text.trim().replace(/\s+/g, " ");
  if (!value || value.length > 500 || /[<>\u0000-\u001f]/.test(value)) return null;
  return value;
}
export function validSeasonFacts(value: unknown): value is SeasonFacts[] {
  return Array.isArray(value) && value.length <= 2000 && value.every((x) => !!x && typeof x === "object" &&
    typeof x.fieldId === "string" && x.fieldId.length > 0 && x.fieldId.length <= 200 && Number.isInteger(x.planningYear) && x.planningYear >= 1900 && x.planningYear <= 2200 &&
    ["available", "unavailable", "unknown"].includes(x.irrigation) && typeof x.sourceMessageId === "string" &&
    x.sourceMessageId.length > 0 && x.sourceMessageId.length <= 200 && typeof x.contextVersion === "string" && x.contextVersion.length > 0 && x.contextVersion.length <= 250 && typeof x.text === "string" && x.text.length > 0 && x.text.length <= 500 && typeof x.savedAt === "string" && Number.isFinite(Date.parse(x.savedAt)));
}
export function readSeasonFacts(): SeasonFacts[] {
  if (!factsStorageFailed) try {
    const value: unknown = JSON.parse(localStorage.getItem(FACTS_KEY) ?? "[]");
    if (validSeasonFacts(value)) memoryFacts = value;
    else { factsStorageFailed = true; console.warn("Meridian season facts could not be validated; retaining in-memory facts."); }
  } catch (error) { factsStorageFailed = true; console.warn("Meridian season facts storage could not be read; retaining in-memory facts.", error); }
  return [...memoryFacts];
}
export function writeSeasonFacts(facts: SeasonFacts[]): boolean {
  if (!validSeasonFacts(facts)) return false;
  memoryFacts = [...facts];
  try { localStorage.setItem(FACTS_KEY, JSON.stringify(facts)); factsStorageFailed = false; return true; } catch (error) { factsStorageFailed = true; console.warn("Meridian season facts could not be persisted; retaining the session copy.", error); return false; }
}
export function replaceSeasonFactsMemory(facts: SeasonFacts[]) { if (validSeasonFacts(facts)) { memoryFacts = [...facts]; factsStorageFailed = false; } }
export function saveSeasonFact(input: Omit<SeasonFacts, "savedAt">, expected: { fieldId: string; contextVersion: string }): boolean {
  const text = correctSeasonFact(input.text);
  if (!text || input.fieldId !== expected.fieldId || input.contextVersion !== expected.contextVersion) return false;
  const facts = readSeasonFacts().filter((f) => !(f.fieldId === input.fieldId && f.planningYear === input.planningYear && f.sourceMessageId === input.sourceMessageId));
  facts.push({ ...input, text, savedAt: new Date().toISOString() });
  return writeSeasonFacts(facts);
}
export function saveMeridianSeasonFacts(input: import("@spaceapps/shared").MeridianSeasonFactsUpdate, current: MeridianChatContext): boolean {
  if (!current.fieldId || input.fieldId !== current.fieldId || input.contextVersion !== current.contextVersion) return false;
  const text = correctSeasonFact(input.sourceQuote ?? "");
  if (!text) return false;
  return saveSeasonFact({ fieldId: input.fieldId, planningYear: input.planningYear, irrigation: input.irrigation.status, sourceMessageId: input.sourceMessageId, contextVersion: input.contextVersion, text }, { fieldId: current.fieldId, contextVersion: current.contextVersion ?? "" });
}
export function buildMeridianContext(input: MeridianChatContext): MeridianChatContext {
  const saved = input.fieldId ? readSeasonFacts().filter((fact) => fact.fieldId === input.fieldId) : [];
  const calendar = input.plan?.cashCropPlantingDate || input.plan?.plantingDate;
  const latestFact = saved.reduce<SeasonFacts | undefined>((latest, fact) => !latest || fact.savedAt >= latest.savedAt ? fact : latest, undefined);
  const year = input.planningYear ?? (calendar ? Number(calendar.slice(0, 4)) : latestFact?.planningYear ?? Number(input.observationDate.slice(0, 4)));
  let irrigation = input.irrigation;
  let matchingFacts: SeasonFacts[] = [];
  if (input.fieldId) {
    matchingFacts = readSeasonFacts().filter((fact) => fact.fieldId === input.fieldId && fact.planningYear === year).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    if (matchingFacts.length) irrigation = { status: matchingFacts[matchingFacts.length - 1].irrigation };
  }
  const { contextVersion: _ignoredVersion, ...source } = input;
  const snapshot = JSON.stringify({ ...source, planningYear: year, irrigation, seasonFacts: matchingFacts.map(({ sourceMessageId, contextVersion, irrigation: status, text }) => ({ sourceMessageId, contextVersion, irrigation: status, text })) });
  let hash = BigInt("14695981039346656037");
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  const prime = BigInt("1099511628211");
  for (let i = 0; i < snapshot.length; i++) hash = ((hash ^ BigInt(snapshot.charCodeAt(i))) * prime) & mask;
  const canonical = { ...input, irrigation, planningYear: year, contextVersion: `${input.fieldId ?? "location"}:${year}:${hash.toString(16).padStart(16, "0")}` };
  return canonical;
}

export function prepareChatProposalDraft(input: {
  proposal: MeridianPlanProposal; fieldId?: string; contextVersion: string; currentCrop: PreviewCrop;
  baseDraft?: FieldPlan; baseEconomics?: EconomicsDraft; boundaryArea?: number;
}): { targetCrop: PreviewCrop; draft: FieldPlan; economics: EconomicsDraft } | null {
  const { proposal, fieldId, contextVersion } = input;
  const changes = proposal?.changes;
  if (!proposal || !fieldId || proposal.fieldId !== fieldId || proposal.contextVersion !== contextVersion || !changes || typeof changes !== "object") return null;
  const crops: PreviewCrop[] = ["corn", "wheat", "soybeans", "cotton", "sorghum"];
  if (changes.crop !== undefined && !crops.includes(changes.crop as PreviewCrop)) return null;
  if (changes.coverCrop !== undefined && !["rye", "pea", "radish", "mix"].includes(changes.coverCrop)) return null;
  if (changes.terminationDays !== undefined && (!Number.isInteger(changes.terminationDays) || changes.terminationDays < 0 || changes.terminationDays > 60 || changes.terminationDays % 5 !== 0)) return null;
  if (changes.cashCropPlantingDate !== undefined && changes.cashCropPlantingDate !== "" && !validDate(changes.cashCropPlantingDate, true)) return null;
  if (changes.areaHa !== undefined && (!Number.isFinite(Number(changes.areaHa)) || Number(changes.areaHa) <= 0 || Number(changes.areaHa) > 5000 || changes.areaHa.length > 40)) return null;
  if (changes.notes !== undefined && (typeof changes.notes !== "string" || changes.notes.length > 4000)) return null;
  const budgetKeys = Object.keys(emptyEconomics);
  if (changes.budget !== undefined && (!changes.budget || Object.entries(changes.budget).some(([key, value]) => !budgetKeys.includes(key) || (value !== undefined && (typeof value !== "string" || value.length > 40 || (value !== "" && !Number.isFinite(Number(value)))))))) return null;
  const targetCrop = (changes.crop ?? input.currentCrop) as PreviewCrop;
  const draft = { ...(input.baseDraft ?? emptyPlan), ...(changes.coverCrop ? { coverCrop: changes.coverCrop as FieldPlan["coverCrop"] } : {}), ...(changes.terminationDays !== undefined ? { terminationDays: changes.terminationDays } : {}), ...(changes.cashCropPlantingDate !== undefined ? { plantingDate: changes.cashCropPlantingDate } : {}), ...(changes.areaHa !== undefined ? { areaHa: changes.areaHa } : {}), ...(changes.notes !== undefined ? { notes: changes.notes } : {}) };
  if (!validPlanDraft(draft) || (draft.plantingDate !== "" && !validDate(draft.plantingDate, true))) return null;
  const economics = { ...emptyEconomics, ...(input.baseEconomics ?? {}), ...(changes.budget ?? {}), ...(input.boundaryArea !== undefined ? { areaHa: String(input.boundaryArea) } : changes.areaHa !== undefined ? { areaHa: changes.areaHa } : {}) } as EconomicsDraft;
  return { targetCrop, draft, economics };
}
