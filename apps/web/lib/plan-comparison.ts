import { calculateEconomics, type EconomicsInputs } from "@/lib/economics";
import { coverCrops, crops, type SavedPlan } from "@/lib/workspace";
import type { UnitSystem } from "@/lib/units";
import { formatArea } from "@/lib/units";

export function planTerminationDate(plan: SavedPlan): string {
  if (!plan.plantingDate) return "Not set";
  const [year, month, day] = plan.plantingDate.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - plan.terminationDays);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function planComparisonText(left: SavedPlan, right: SavedPlan, unit: UnitSystem, names?: [string, string]): string {
  const rows = [left, right].map((plan) => {
    const field = names?.[left === plan ? 0 : 1] || plan.location.name || "Unnamed field";
    const cover = coverCrops.find((crop) => crop.value === plan.coverCrop)?.label ?? plan.coverCrop;
    const crop = crops.find((item) => item.value === plan.crop)?.label ?? plan.crop;
    return [
      `${field} — ${crop}`,
      `Plan: ${plan.name || "Unnamed plan"}`,
      `Budget: ${plan.budget ? (() => { const result = calculateEconomics(Object.fromEntries(Object.entries(plan.budget).map(([k, v]) => [k, Number(v)])) as unknown as EconomicsInputs); return result ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(result.totalReturnAfterCoverCropCosts) + " whole-field estimated return after entered cover-crop costs; other production expenses excluded" : "Unavailable"; })() : "Not added"}`,
      `Field: ${field}`, `Cash crop: ${crop}`, `Cover crop: ${cover}`,
      `Planting date: ${plan.plantingDate || "Not set"}`,
      `Calculated termination date: ${planTerminationDate(plan)}`,
      `Lead time: ${plan.terminationDays} days before planting`,
      `Area: ${plan.areaHa ? formatArea(Number(plan.areaHa), unit) : plan.location.areaHectares ? formatArea(plan.location.areaHectares, unit) : "Not set"}`,
      `Saved: ${new Date(plan.savedAt).toLocaleString()}`,
      `Location: ${plan.location.latitude}, ${plan.location.longitude}`,
      `Notes: ${plan.notes.trim() || "None"}`,
    ].join("\n");
  });
  return ["Field Shift — saved plan comparison", "Manual calendar plans; dates are calculated from the saved planting date and lead time. This is not a model prediction.", "", ...rows].join("\n\n");
}

export function plansHaveDifferentContexts(left: SavedPlan, right: SavedPlan) {
  const identity = (plan: SavedPlan) => plan.location.fieldId ? `field:${plan.location.fieldId}` : plan.location.benchmarkId ? `benchmark:${plan.location.benchmarkId}` : plan.location.hexId ? `hex:${plan.location.hexId}` : `${plan.location.latitude.toFixed(5)},${plan.location.longitude.toFixed(5)}`;
  return identity(left) !== identity(right) || left.crop !== right.crop;
}
