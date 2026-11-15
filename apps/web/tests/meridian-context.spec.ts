import { expect, test } from "@playwright/test";
import { buildMeridianContext, readSeasonFacts, saveSeasonFact, validSeasonFacts, prepareChatProposalDraft, writeSeasonFacts } from "../lib/meridian/context";
import type { MeridianChatContext } from "@spaceapps/shared";
import completeRequest from "../../../shared/payloads/meridian-chat-context-complete.json";
import { chatRequestSchema } from "../lib/meridian/validation";

const memory = new Map<string, string>();
let failWrites = false;
const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrites) throw new Error("quota"); memory.set(key, value); }, removeItem: (key: string) => memory.delete(key) };
const base: MeridianChatContext = { latitude: 39, longitude: -99, locationName: "Field", fieldId: "field-1", crop: "wheat", observationDate: "2026-06-01", plan: { coverCrop: "pea", terminationDays: 20, plantingDate: "2027-09-10", areaHa: "10", notes: "", status: "draft" }, economicsDraft: { seedCost: "100" }, savedAlternatives: [] };

test.beforeEach(() => { failWrites = false; memory.clear(); Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage }); });

test("full optional Meridian context fixture passes the client contract", () => {
  expect(chatRequestSchema.parse(completeRequest).context).toMatchObject({ areaSource: "boundary", budgetState: "draft", planningYear: 2027 });
});

test("context version changes when budget, alternative identity, or planting date changes", () => {
  const initial = buildMeridianContext(base);
  expect(buildMeridianContext(base).contextVersion).toBe(initial.contextVersion);
  expect(buildMeridianContext({ ...base, economicsDraft: { seedCost: "101" } }).contextVersion).not.toBe(initial.contextVersion);
  expect(buildMeridianContext({ ...base, savedAlternatives: [{ id: "alt-2", crop: "corn", coverCrop: "pea", terminationDays: 20, cashCropPlantingDate: "2027-09-10", areaHa: "10" }] }).contextVersion).not.toBe(initial.contextVersion);
  expect(buildMeridianContext({ ...base, plan: { ...base.plan!, plantingDate: "2027-09-11" } }).contextVersion).not.toBe(initial.contextVersion);
});

test("build ignores incoming contextVersion and reuses latest saved year when calendar is absent", () => {
  const saved = { fieldId: "field-1", planningYear: 2028, irrigation: "available" as const, sourceMessageId: "msg-1", contextVersion: "prior", text: "Irrigation available", savedAt: "2026-01-01T00:00:00.000Z" };
  expect(saveSeasonFact(saved, { fieldId: "field-1", contextVersion: "prior" })).toBe(true);
  const { plan: _plan, contextVersion: _version, ...withoutCalendar } = base;
  const context = buildMeridianContext({ ...withoutCalendar, contextVersion: "caller-controlled" });
  expect(context.planningYear).toBe(2028);
  expect(context.irrigation).toEqual({ status: "available" });
  expect(context.contextVersion).not.toBe("caller-controlled");
  expect(readSeasonFacts()).toHaveLength(1);
});

test("a later explicit correction to an earlier year wins on reload", () => {
  const earlier = { fieldId: "field-1", planningYear: 2028, irrigation: "available" as const, sourceMessageId: "msg-old", contextVersion: "old", text: "Year was 2028", savedAt: "2026-01-01T00:00:00.000Z" };
  const correction = { ...earlier, planningYear: 2027, sourceMessageId: "msg-correction", contextVersion: "corrected", text: "Correction: year is 2027" };
  expect(writeSeasonFacts([earlier, correction])).toBe(true);
  const { plan: _plan, contextVersion: _version, ...withoutCalendar } = base;
  expect(buildMeridianContext(withoutCalendar).planningYear).toBe(2027);
});

test("facts reject invalid identities, years, and cross-field or stale saves", () => {
  expect(validSeasonFacts([{ fieldId: "", planningYear: 2300, irrigation: "bad", sourceMessageId: "", contextVersion: "", text: "", savedAt: "n/a" }])).toBe(false);
  const fact = { fieldId: "field-1", planningYear: 2027, irrigation: "unknown" as const, sourceMessageId: "msg-1", contextVersion: "v1", text: "Confirmed unknown", savedAt: "2026-01-01T00:00:00.000Z" };
  expect(saveSeasonFact(fact, { fieldId: "another-field", contextVersion: "v1" })).toBe(false);
  expect(saveSeasonFact(fact, { fieldId: "field-1", contextVersion: "stale" })).toBe(false);
});

test("storage failure retains new facts in memory for this session", () => {
  const fact = { fieldId: "field-1", planningYear: 2027, irrigation: "available" as const, sourceMessageId: "msg-storage", contextVersion: "v2", text: "Irrigation confirmed", savedAt: "2026-01-01T00:00:00.000Z" };
  failWrites = true;
  expect(writeSeasonFacts([fact])).toBe(false);
  expect(readSeasonFacts()).toEqual([fact]);
  failWrites = false;
  expect(writeSeasonFacts([])).toBe(true);
});

test("invalid cash crop dates cannot prepare a draft", () => {
  const proposal = { id: "proposal-1", fieldId: "field-1", contextVersion: "v1", changes: { cashCropPlantingDate: "2027-02-30" } };
  const prepared = prepareChatProposalDraft({ proposal, fieldId: "field-1", contextVersion: "v1", currentCrop: "wheat" });
  expect(prepared).toBeNull();
  expect(memory.size).toBe(0);
});
