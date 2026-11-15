import { calculateEconomics, type EconomicsInputs } from "@/lib/economics";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { isValidCell } from "h3-js";
import farms from "@/data/benchmark_farms.json";
import type { MapSettings, PreviewCrop, Selection } from "@/lib/map/types";
import { DEFAULT_BASEMAP, isBasemapId } from "@/lib/map/basemaps";

export const today = () => new Date().toISOString().slice(0, 10);
export const crops: { value: PreviewCrop; label: string }[] = [
  { value: "wheat", label: "Wheat" },
  { value: "corn", label: "Corn" },
  { value: "soybeans", label: "Soybeans" },
  { value: "cotton", label: "Cotton" },
  { value: "sorghum", label: "Sorghum" },
];
export const coverCrops = [
  { value: "rye", label: "Cereal rye", description: "Grass" },
  { value: "pea", label: "Winter pea", description: "Legume" },
  { value: "radish", label: "Forage radish", description: "Brassica" },
  { value: "mix", label: "Multi-species mix", description: "Mixed cover" },
] as const;
export interface FieldPlan {
  coverCrop: "rye" | "pea" | "radish" | "mix";
  terminationDays: number;
  plantingDate: string;
  areaHa: string;
  notes: string;
}
export interface SavedPlan extends FieldPlan {
  snapshotVersion?: 1;
  id?: string;
  name?: string;
  budget?: EconomicsDraft;
  location: Selection;
  crop: PreviewCrop;
  savedAt: string;
}
// Drafts accept unfinished dates/area values so navigation never erases input.
export function validPlanDraft(value: unknown): value is FieldPlan {
  if (!value || typeof value !== "object") return false;
  const draft = value as FieldPlan;
  return coverCrops.some((crop) => crop.value === draft.coverCrop) &&
    Number.isInteger(draft.terminationDays) && draft.terminationDays >= 0 &&
    draft.terminationDays <= 60 && draft.terminationDays % 5 === 0 &&
    typeof draft.plantingDate === "string" && draft.plantingDate.length <= 10 &&
    typeof draft.areaHa === "string" && draft.areaHa.length <= 40 &&
    typeof draft.notes === "string" && draft.notes.length <= 4000;
}
export const emptyPlan: FieldPlan = {
  coverCrop: "rye",
  terminationDays: 30,
  plantingDate: "",
  areaHa: "",
  notes: "",
};
export interface EconomicsDraft {
  grainPrice: string;
  baselineYield: string;
  yieldChange: string;
  seedCost: string;
  terminationCost: string;
  subsidy: string;
  areaHa: string;
}
export const emptyEconomics: EconomicsDraft = {
  grainPrice: "",
  baselineYield: "",
  yieldChange: "",
  seedCost: "",
  terminationCost: "",
  subsidy: "",
  areaHa: "",
};
export const initialSettings: MapSettings = {
  mode: "field",
  crop: "wheat",
  timeMode: "latest",
  observationDate: today(),
  overlay: "off",
  opacity: 0.55,
  basemap: DEFAULT_BASEMAP,
  selection: {
    latitude: farms[0].latitude,
    longitude: farms[0].longitude,
    name: farms[0].name,
    benchmarkId: farms[0].id,
  },
};
export function validDate(
  value: unknown,
  allowFuture = false,
): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === value &&
    (allowFuture || value <= today())
  );
}
export function contextKey(settings: MapSettings) {
  return `${settings.selection.fieldId ?? settings.selection.benchmarkId ?? settings.selection.hexId ?? `${settings.selection.latitude.toFixed(4)},${settings.selection.longitude.toFixed(4)}`}|${settings.crop}`;
}
export function locationLabel(selection: Selection) {
  return `${selection.name}${selection.benchmarkId ? ", Kansas" : ""}`;
}
/** Saved alternatives use stable keys; legacy field/crop plans remain compatible. */
export function planContextKey(plan: SavedPlan) {
  const s = plan.location;
  return `${s.fieldId ?? s.benchmarkId ?? s.hexId ?? `${s.latitude.toFixed(4)},${s.longitude.toFixed(4)}`}|${plan.crop}`;
}
export function planStorageKey(plan: SavedPlan) {
  return `${planContextKey(plan)}${plan.id ? `|${plan.id}` : ""}`;
}
export function validBudget(value: unknown): value is EconomicsDraft {
  if (!value || typeof value !== "object") return false;
  const budget = value as EconomicsDraft;
  if (!Object.keys(emptyEconomics).every(key => {
    const text = budget[key as keyof EconomicsDraft];
    return typeof text === "string" && text.trim() !== "" && text.length <= 40 && Number.isFinite(Number(text));
  })) return false;
  return Number(budget.areaHa) > 0 && Number(budget.areaHa) <= 5000 &&
    calculateEconomics(Object.fromEntries(Object.entries(budget).map(([key, text]) => [key, Number(text)])) as unknown as EconomicsInputs) !== null;
}
export function validPlan(value: unknown): value is SavedPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as SavedPlan;
  return (
    coverCrops.some((c) => c.value === p.coverCrop) &&
    Number.isInteger(p.terminationDays) &&
    p.terminationDays >= 0 &&
    p.terminationDays <= 60 &&
    p.terminationDays % 5 === 0 &&
    typeof p.plantingDate === "string" &&
    (!p.plantingDate || validDate(p.plantingDate, true)) &&
    typeof p.areaHa === "string" &&
    (!p.areaHa ||
      (Number.isFinite(Number(p.areaHa)) &&
        Number(p.areaHa) > 0 &&
        Number(p.areaHa) <= 5000)) &&
    typeof p.notes === "string" &&
    p.notes.length <= 4000 &&
    (p.snapshotVersion === undefined || p.snapshotVersion === 1) &&
    (p.id === undefined || (typeof p.id === "string" && /^[0-9a-f-]{36}$/i.test(p.id))) &&
    (p.name === undefined || (typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 100)) &&
    (p.budget === undefined || (validBudget(p.budget) && p.budget.areaHa === p.areaHa)) &&
    typeof p.savedAt === "string" &&
    validMapSettings({
      ...initialSettings,
      crop: p.crop,
      selection: p.location,
    })
  );
}
export function validMapSettings(value: unknown): value is MapSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<MapSettings>;
  const date = v.observationDate;
  const parsedDate =
    typeof date === "string" ? new Date(`${date}T00:00:00Z`) : null;
  return (
    (v.mode === "field" || v.mode === "atlas") &&
    crops.some((c) => c.value === v.crop) &&
    (v.timeMode === "latest" || v.timeMode === "past") &&
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    parsedDate !== null &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date &&
    date <= today() &&
    (v.overlay === "off" ||
      ["smap", "ndvi", "imerg"].includes(v.overlay ?? "")) &&
    (v.drought === undefined || typeof v.drought === "boolean") &&
    (v.basemap === undefined || isBasemapId(v.basemap)) &&
    typeof v.opacity === "number" &&
    Number.isFinite(v.opacity) &&
    v.opacity >= 0 &&
    v.opacity <= 1 &&
    !!v.selection &&
    typeof v.selection.latitude === "number" &&
    Number.isFinite(v.selection.latitude) &&
    Math.abs(v.selection.latitude) <= 90 &&
    typeof v.selection.longitude === "number" &&
    Number.isFinite(v.selection.longitude) &&
    Math.abs(v.selection.longitude) <= 180 &&
    typeof v.selection.name === "string" &&
    (v.selection.fieldId === undefined ||
      (typeof v.selection.fieldId === "string" &&
        v.selection.fieldId.length > 0)) &&
    (v.selection.boundary === undefined ||
      (!!analyzeBoundary(v.selection.boundary) &&
        !analyzeBoundary(v.selection.boundary)?.error)) &&
    (v.selection.areaHectares === undefined ||
      (Number.isFinite(v.selection.areaHectares) &&
        v.selection.areaHectares > 0 &&
        v.selection.areaHectares <= 5000)) &&
    (v.selection.hexId === undefined ||
      (typeof v.selection.hexId === "string" &&
        isValidCell(v.selection.hexId))) &&
    (v.selection.benchmarkId === undefined ||
      farms.some((farm) => farm.id === v.selection?.benchmarkId))
  );
}
