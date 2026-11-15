import { cellToBoundary, getResolution, isValidCell } from "h3-js";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { AtlasCell } from "@spaceapps/shared";

// Fixed diverging scale keeps the map and its legend comparable across
// scenarios. Values outside the documented range clip to the endpoint.
export const ATLAS_LEGEND_STOPS = [
  { value: -200, label: "≤ −$200 / ha", color: "#a63b35" },
  { value: -100, label: "−$100 / ha", color: "#d98d81" },
  { value: 0, label: "$0 / ha", color: "#e7e6df" },
  { value: 100, label: "+$100 / ha", color: "#8eb99a" },
  { value: 200, label: "≥ +$200 / ha", color: "#286b48" },
];

export const ATLAS_NO_DATA_COLOR = "#85877f";
export const ATLAS_NO_ACREAGE_COLOR = "#c4c7be";
export const ATLAS_MISSING_LEGEND = [
  { label: "No active acreage", color: ATLAS_NO_ACREAGE_COLOR },
  { label: "Return unavailable", color: ATLAS_NO_DATA_COLOR },
];
export function isAtlasCell(value: unknown): value is AtlasCell {
  if (!value || typeof value !== "object") return false;
  const cell = value as AtlasCell;
  const optionalNumbers = [cell.activeAreaHa, cell.netReturnUsdHa, cell.yieldPenaltyPct, cell.rootZoneWetness];
  return isValidCell(cell.h3Index) && ["wheat", "corn", "soybeans", "cotton", "sorghum"].includes(cell.crop) &&
    typeof cell.scenarioId === "string" && !!cell.scenarioId &&
    optionalNumbers.every((number) => number === null || (typeof number === "number" && Number.isFinite(number))) &&
    (cell.activeAreaHa === null || cell.activeAreaHa >= 0) &&
    (cell.yieldPenaltyPct === null || (cell.yieldPenaltyPct <= 100)) &&
    (cell.rootZoneWetness === null || (cell.rootZoneWetness >= 0 && cell.rootZoneWetness <= 1)) &&
    !((cell.activeAreaHa === null || cell.activeAreaHa === 0) && [cell.netReturnUsdHa, cell.yieldPenaltyPct].some((item) => item !== null)) &&
    (cell.soilTexture === null || (typeof cell.soilTexture === "string" && cell.soilTexture.length <= 100));
}

export function validatedAtlasCells(values: readonly unknown[] | undefined): AtlasCell[] {
  if (!values?.length) return [];
  const unique = new Map<string, AtlasCell>();
  for (const value of values) {
    if (isAtlasCell(value) && !unique.has(value.h3Index)) unique.set(value.h3Index, value);
  }
  const valid = [...unique.values()];
  const resolutions = new Set(valid.map((cell) => getResolution(cell.h3Index)));
  return resolutions.size <= 1 ? valid : [];
}

export function atlasColor(netReturnUsdHa: number | null, activeAreaHa: number | null = null): string {
  if (activeAreaHa === 0) return ATLAS_NO_ACREAGE_COLOR;
  if (netReturnUsdHa === null || !Number.isFinite(netReturnUsdHa)) return ATLAS_NO_DATA_COLOR;
  const stops = ATLAS_LEGEND_STOPS;
  const value = Math.max(stops[0].value, Math.min(stops[stops.length - 1].value, netReturnUsdHa));
  const upperIndex = stops.findIndex((stop) => stop.value >= value);
  if (upperIndex <= 0) return stops[0].color;
  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];
  const t = (value - lower.value) / (upper.value - lower.value);
  const a = parseHex(lower.color);
  const b = parseHex(upper.color);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t).toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(value: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

export function atlasFeatureCollection(cells: readonly AtlasCell[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = cells.map((cell) => ({
    type: "Feature",
    id: cell.h3Index,
    properties: { ...cell, atlasColor: atlasColor(cell.netReturnUsdHa, cell.activeAreaHa) },
    geometry: (() => { const ring = cellToBoundary(cell.h3Index, true); return { type: "Polygon", coordinates: [[...ring, ring[0]]] }; })(),
  }));
  return { type: "FeatureCollection", features };
}

export async function createAtlasDeckOverlay(
  cells: readonly AtlasCell[],
  selectedH3?: string,
  beforeId?: string,
  onHover?: (cell: AtlasCell | null) => void,
  onError?: (error: Error) => void,
  onAfterRender?: () => void,
) {
  const { MapLibreOverlay } = await import("@deck.gl/maplibre");
  const overlay = new MapLibreOverlay({
    interleaved: true,
    layers: [await createAtlasDeckLayer(cells, selectedH3, beforeId, onHover)],
    useDevicePixels: 1,
    onError: (error) => { console.error("Atlas deck.gl rendering failed", error); onError?.(error); },
    onAfterRender,
  });
  return overlay;
}

export async function createAtlasDeckLayer(cells: readonly AtlasCell[], selectedH3?: string, beforeId?: string, onHover?: (cell: AtlasCell | null) => void) {
  const { H3HexagonLayer } = await import("@deck.gl/geo-layers");
  const layer = new H3HexagonLayer<AtlasCell>({
      id: "atlas-regional-cells",
      data: cells,
      ...(beforeId ? { beforeId } : {}),
      getHexagon: (cell) => cell.h3Index,
      getFillColor: (cell) => [...parseHex(atlasColor(cell.netReturnUsdHa, cell.activeAreaHa)), 205],
      getLineColor: (cell) => cell.h3Index === selectedH3 ? [24, 58, 36, 245] : [255, 255, 255, 185],
      getLineWidth: (cell) => cell.h3Index === selectedH3 ? 2 : 0.5,
      lineWidthUnits: "pixels",
      stroked: true,
      filled: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 110],
      onHover: (info) => onHover?.(info.object ?? null),
      updateTriggers: { getLineColor: [selectedH3], getLineWidth: [selectedH3] },
    });
  return layer;
}
