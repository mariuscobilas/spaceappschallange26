import type { SavedField } from "@spaceapps/shared";
import type { Selection } from "@/lib/map/types";
import { crops } from "@/lib/workspace";
import { analyzeBoundary } from "@/lib/fields/geometry";

export function fieldSelection(field: SavedField): Selection {
  return {
    name: field.name,
    latitude: field.location.latitude,
    longitude: field.location.longitude,
    fieldId: field.id,
    benchmarkId: field.benchmarkId,
    boundary: field.boundary,
    areaHectares: field.areaHectares,
  };
}
export function validSavedField(value: unknown): value is SavedField {
  if (!value || typeof value !== "object") return false;
  const f = value as SavedField;
  if (
    typeof f.id !== "string" ||
    !f.id ||
    f.id.length > 100 ||
    typeof f.name !== "string" ||
    !f.name.trim() ||
    f.name.length > 100 ||
    !f.location ||
    !Number.isFinite(f.location.latitude) ||
    !Number.isFinite(f.location.longitude) ||
    f.location.latitude < 24 ||
    f.location.latitude > 50 ||
    f.location.longitude < -125 ||
    f.location.longitude > -66 ||
    !crops.some((c) => c.value === f.currentCrop) ||
    !["manual", "cdl"].includes(f.cropSource) ||
    typeof f.createdAt !== "string" ||
    !Number.isFinite(Date.parse(f.createdAt)) ||
    typeof f.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(f.updatedAt))
  )
    return false;
  if (
    f.areaHectares !== undefined &&
    (!Number.isFinite(f.areaHectares) ||
      f.areaHectares <= 0 ||
      f.areaHectares > 5000)
  )
    return false;
  if (f.boundary) {
    const info = analyzeBoundary(f.boundary);
    if (!info || info.error) return false;
  }
  return true;
}
export function normalizeField(field: SavedField): SavedField {
  if (!field.boundary) return field;
  const info = analyzeBoundary(field.boundary)!;
  return { ...field, location: info.centroid, areaHectares: info.areaHectares };
}
