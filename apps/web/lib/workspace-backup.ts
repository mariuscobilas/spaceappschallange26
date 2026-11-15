import type { SavedField } from "@spaceapps/shared";
import type { MapSettings } from "@/lib/map/types";
import type { EconomicsDraft, FieldPlan, SavedPlan } from "@/lib/workspace";
import { emptyEconomics, planStorageKey, validMapSettings, validPlan, validPlanDraft } from "@/lib/workspace";
import { validSavedField } from "@/lib/fields/storage";

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const UNIT_KEY = "meridian.unit-system.v1";
export const BACKUP_KEYS = {
  settings: "meridian.map-settings.v3",
  fields: "meridian.fields.v1",
  plans: "meridian.field-plans.v2",
  drafts: "meridian.plan-drafts.v1",
  economics: "meridian.economics.v2",
} as const;
export type WorkspaceBackup = {
  version: 1;
  exportedAt: string;
  settings: MapSettings;
  fields: SavedField[];
  activeFieldId?: string;
  plans: Record<string, SavedPlan>;
  drafts: Record<string, FieldPlan>;
  economics: Record<string, EconomicsDraft>;
  unitSystem: "metric" | "us";
};

const safeKey = (key: string) => key.length > 0 && key.length <= 300 && !/[\u0000-\u001f]/.test(key) && !["__proto__", "prototype", "constructor"].includes(key);
const record = <T>(value: unknown, validate: (item: unknown) => item is T): value is Record<string, T> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([key, item]) => safeKey(key) && validate(item));
const validEconomics = (value: unknown): value is EconomicsDraft => !!value && typeof value === "object" &&
  Object.keys(emptyEconomics).every((key) => typeof (value as Record<string, unknown>)[key] === "string" && (value as Record<string, string>)[key].length <= 40);
export function parseWorkspaceBackup(input: string): WorkspaceBackup {
  if (new TextEncoder().encode(input).byteLength > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 5 MB limit.");
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error("This file is not valid JSON."); }
  if (!value || typeof value !== "object") throw new Error("Backup must be a JSON object.");
  const v = value as Record<string, unknown>;
  const fieldsEnvelope = v.fields;
  if (v.version !== BACKUP_VERSION || typeof v.exportedAt !== "string" || !Number.isFinite(Date.parse(v.exportedAt)) ||
      !validMapSettings(v.settings) || !Array.isArray(fieldsEnvelope) || !fieldsEnvelope.every(validSavedField) ||
      !record(v.plans, validPlan) || !record(v.drafts, validPlanDraft) || !record(v.economics, validEconomics) ||
      (v.unitSystem !== "metric" && v.unitSystem !== "us") ||
      (v.activeFieldId !== undefined && (typeof v.activeFieldId !== "string" || !safeKey(v.activeFieldId)))) {
    throw new Error("Backup contents are invalid or from an unsupported version.");
  }
  if (fieldsEnvelope.length > 500 || Object.keys(v.plans).length > 2000 || Object.keys(v.drafts).length > 2000 || Object.keys(v.economics).length > 2000)
    throw new Error("Backup contains too many workspace items.");
  const fieldIds = new Set(fieldsEnvelope.map((field) => field.id));
  if (fieldIds.size !== fieldsEnvelope.length) throw new Error("Backup contains duplicate field IDs.");
  if (Object.entries(v.plans).some(([key, plan]) => key !== planStorageKey(plan as SavedPlan)))
    throw new Error("A saved plan key does not match its field and crop context.");
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const key of [...Object.keys(v.drafts), ...Object.keys(v.economics)]) {
    const [id, crop] = key.split("|");
    if (crop && uuidLike.test(id) && !fieldIds.has(id)) throw new Error("A working record refers to a field that is missing from its field list.");
  }
  if (Object.values(v.plans).some((plan) => (plan as SavedPlan).location.fieldId && !fieldIds.has((plan as SavedPlan).location.fieldId!)) ||
      (v.settings as MapSettings).selection.fieldId && !fieldIds.has((v.settings as MapSettings).selection.fieldId!) ||
      (v.activeFieldId !== undefined && !fieldIds.has(v.activeFieldId as string)))
    throw new Error("Backup refers to a field that is missing from its field list.");
  return v as WorkspaceBackup;
}
