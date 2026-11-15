import type { AtlasDataset, AtlasCell } from "@spaceapps/shared";
import { isValidCell, cellToLatLng, getResolution } from "h3-js";
import { crops, validDate } from "@/lib/workspace";
export const unavailableAtlas = (message: string): AtlasDataset => ({ status: "unavailable", message, datasetId: null, generatedAt: null, validation: null, scenarios: [], cells: [], provenance: [] });
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 4000;
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
export const safeLink = (s: unknown) => { try { return typeof s === "string" && new URL(s).protocol === "https:"; } catch { return false; } };
export function validateAtlas(value: unknown): value is AtlasDataset {
  if (!value || typeof value !== "object") return false;
  const v = value as AtlasDataset;
  if (!text(v.message) || !Array.isArray(v.scenarios) || !Array.isArray(v.cells) || !Array.isArray(v.provenance)) return false;
  if (v.status === "unavailable") return v.cells.length === 0 && v.scenarios.length === 0 && v.validation === null;
  if (v.status !== "available" || !text(v.datasetId) || !text(v.generatedAt) || !Number.isFinite(Date.parse(v.generatedAt)) || v.validation?.status !== "validated" || !text(v.validation.method) || !text(v.validation.reference) || v.scenarios.length === 0 || v.scenarios.length > 20 || v.cells.length === 0 || v.cells.length > 10000 || v.provenance.length === 0 || v.provenance.length > 50) return false;
  const ids = new Set<string>();
  for (const s of v.scenarios) {
    if (!s || !text(s.id) || ids.has(s.id) || !text(s.label) || !text(s.baseline) || !validDate(s.periodStart, true) || !validDate(s.periodEnd, true) || s.periodStart > s.periodEnd) return false;
    ids.add(s.id);
  }
  if (!v.provenance.every(p => p && text(p.title) && safeLink(p.url) && text(p.spatialMeaning) && (p.periodStart === undefined || validDate(p.periodStart, true)) && (p.periodEnd === undefined || validDate(p.periodEnd, true)))) return false;
  const keys = new Set<string>();
  const resolutions = new Map<string, number>();
  for (const c of v.cells) {
    if (!c || typeof c.h3Index !== "string" || !isValidCell(c.h3Index) || !crops.some(item => item.value === c.crop) || !ids.has(c.scenarioId)) return false;
    const [lat, lon] = cellToLatLng(c.h3Index);
    if (lat < 24 || lat > 50 || lon < -125 || lon > -66) return false;
    const key = `${c.h3Index}|${c.crop}|${c.scenarioId}`;
    const group = `${c.crop}|${c.scenarioId}`;
    if (keys.has(key) || (resolutions.has(group) && resolutions.get(group) !== getResolution(c.h3Index))) return false;
    keys.add(key); resolutions.set(group, getResolution(c.h3Index));
    if (!(c.activeAreaHa === null || finite(c.activeAreaHa) && c.activeAreaHa >= 0) || !(c.netReturnUsdHa === null || finite(c.netReturnUsdHa)) || !(c.yieldPenaltyPct === null || finite(c.yieldPenaltyPct) && c.yieldPenaltyPct <= 100) || !(c.rootZoneWetness === null || finite(c.rootZoneWetness) && c.rootZoneWetness >= 0 && c.rootZoneWetness <= 1) || !(c.soilTexture === null || text(c.soilTexture))) return false;
    if ((c.activeAreaHa === null || c.activeAreaHa === 0) && (c.netReturnUsdHa !== null || c.yieldPenaltyPct !== null)) return false;
  }
  return true;
}
export function atlasCellState(cell: AtlasCell) { return cell.activeAreaHa === 0 ? "no-active-acreage" : cell.activeAreaHa === null || cell.netReturnUsdHa === null ? "missing" : "available"; }
