import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import kinks from "@turf/kinks";
import pointOnFeature from "@turf/point-on-feature";
import { point, polygon } from "@turf/helpers";
import type { GeoPolygon } from "@spaceapps/shared";

export interface BoundaryAnalysis {
  areaHectares: number;
  centroid: { latitude: number; longitude: number };
  sample: { latitude: number; longitude: number };
  error?: string;
}

const MAX_AREA_HECTARES = 5_000;

/** Analyze and validate a single-ring field boundary in GeoJSON lon/lat order. */
export function analyzeBoundary(boundary: GeoPolygon): BoundaryAnalysis | null {
  if (boundary?.type !== "Polygon" || !Array.isArray(boundary.coordinates))
    return null;
  const [ring, ...holes] = boundary.coordinates;
  if (!ring || holes.length !== 0 || ring.length < 4) return null;
  if (
    ring.some(
      (coord) =>
        !Array.isArray(coord) ||
        coord.length < 2 ||
        !Number.isFinite(coord[0]) ||
        !Number.isFinite(coord[1]) ||
        coord[0] < -180 ||
        coord[0] > 180 ||
        coord[1] < -90 ||
        coord[1] > 90,
    )
  )
    return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;

  let shape;
  try {
    shape = polygon([ring]);
  } catch {
    return null;
  }
  const selfIntersects = kinks(shape).features.length > 0;
  const squareMeters = area(shape);
  if (!Number.isFinite(squareMeters) || (squareMeters <= 0 && !selfIntersects))
    return null;
  const hectares = Math.max(0, squareMeters) / 10_000;
  const center = centerOfMass(shape).geometry.coordinates;
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return null;
  const centroid = { latitude: center[1], longitude: center[0] };
  const centerPoint = point(center);
  const sample = booleanPointInPolygon(centerPoint, shape)
    ? centroid
    : (() => {
        const coords = pointOnFeature(shape).geometry.coordinates;
        return { latitude: coords[1], longitude: coords[0] };
      })();

  const outsideConus = ring.some(
    ([longitude, latitude]) =>
      longitude < -125 || longitude > -66 || latitude < 24 || latitude > 50,
  );
  const error = selfIntersects
    ? "Boundary edges cross; redraw the field without self-intersections."
    : outsideConus
      ? "Field boundary must be within the contiguous United States."
      : hectares > MAX_AREA_HECTARES
        ? "Field boundary exceeds the 5,000 hectare limit."
        : undefined;

  return {
    areaHectares: hectares,
    centroid,
    sample,
    ...(error ? { error } : {}),
  };
}
