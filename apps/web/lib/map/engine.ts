import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import {
  cellToBoundary,
  polygonToCells,
  cellToLatLng,
  latLngToCell,
} from "h3-js";
import type { LayerInfo, Overlay } from "./types";

export const DEFAULT_CAMERA = {
  center: [-99, 38.7] as [number, number],
  zoom: 6,
};
export const ATLAS_CAMERA = {
  center: [-98.5, 39.8] as [number, number],
  zoom: 3.5,
};
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f2f3f1" },
    },
  ],
};
export const OVERLAYS: Record<
  Exclude<Overlay, "off">,
  {
    layer: string;
    matrix: string;
    legend: string;
    units: string;
    description: string;
    snapshot: string;
  }
> = {
  smap: {
    layer: "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    matrix: "GoogleMapsCompatible_Level6",
    legend: "SMAP_Analyzed_Soil_Moisture_H.svg",
    units: "m³/m³",
    description:
      "Coarse spatial resolution soil moisture analysis; not field-scale measurement.",
    snapshot: "2026-11-10",
  },
  ndvi: {
    layer: "VIIRS_NOAA20_NDVI_8Day",
    matrix: "GoogleMapsCompatible_Level8",
    legend: "MODIS_NDVI_H.svg",
    units: "NDVI",
    description:
      "Eight-day vegetation index composite; values represent a period, not a live reading.",
    snapshot: "2026-11-13",
  },
  imerg: {
    layer: "IMERG_Precipitation_Rate",
    matrix: "GoogleMapsCompatible_Level6",
    legend: "GPM_Precipitation_Rate_H.svg",
    units: "mm/hour",
    description:
      "Precipitation rate estimate; a satellite product, not a local rain gauge.",
    snapshot: "2026-11-12",
  },
};
const GIBS = "https://gibs.earthdata.nasa.gov";
let capabilitiesRequest: Promise<string> | undefined;

export function resolveObservationDate(
  values: string[],
  requestedDate: string,
): string | null {
  const validDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  };
  if (!validDate(requestedDate)) return null;
  const available = new Set<string>();
  for (const raw of values.flatMap((value) => value.split(","))) {
    const value = raw.trim();
    if (validDate(value)) available.add(value);
    const range = value.match(
      /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})(?:\/(P\d+D))?$/,
    );
    if (!range) continue;
    const [, from, to, period] = range;
    if (!validDate(from) || !validDate(to)) continue;
    const step = period ? Number(period.match(/P(\d+)D/)?.[1]) : 1;
    if (!Number.isFinite(step) || step < 1) continue;
    const first = Date.parse(`${from}T00:00:00Z`);
    const last = Date.parse(`${to}T00:00:00Z`);
    const requested = Date.parse(`${requestedDate}T00:00:00Z`);
    const eligibleLast = Math.min(last, requested);
    if (eligibleLast < first) continue;
    const aligned =
      first +
      Math.floor((eligibleLast - first) / (step * 86400000)) * step * 86400000;
    available.add(new Date(aligned).toISOString().slice(0, 10));
  }
  return (
    [...available]
      .filter((date) => date <= requestedDate)
      .sort()
      .at(-1) ?? null
  );
}

export async function layerDates(
  layer: string,
): Promise<{ defaultDate: string; values: string[] }> {
  capabilitiesRequest ??= fetch(
    `${GIBS}/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities`,
    { signal: AbortSignal.timeout(10_000) },
  )
    .then((r) => {
      if (!r.ok) throw new Error(`NASA GIBS metadata returned ${r.status}`);
      return r.text();
    })
    .catch((error) => {
      capabilitiesRequest = undefined;
      throw error;
    });
  const doc = new DOMParser().parseFromString(
    await capabilitiesRequest,
    "application/xml",
  );
  const target = Array.from(doc.getElementsByTagNameNS("*", "Layer")).find(
    (node) =>
      Array.from(node.getElementsByTagNameNS("*", "Identifier")).some(
        (id) => id.textContent === layer,
      ),
  );
  if (!target) throw new Error(`NASA GIBS metadata did not list ${layer}`);
  const time = Array.from(target.getElementsByTagNameNS("*", "Dimension")).find(
    (node) =>
      Array.from(node.getElementsByTagNameNS("*", "Identifier")).some(
        (id) => id.textContent?.toLowerCase() === "time",
      ),
  );
  const defaultDate = time
    ?.getElementsByTagNameNS("*", "Default")[0]
    ?.textContent?.trim();
  if (!defaultDate || !/^\d{4}-\d{2}-\d{2}$/.test(defaultDate))
    throw new Error(`No current NASA GIBS date for ${layer}`);
  const values = Array.from(
    time?.getElementsByTagNameNS("*", "Value") ?? [],
  ).map((node) => node.textContent?.trim() ?? "");
  return { defaultDate, values };
}

export function tileTemplate(layer: string, date: string, matrix: string) {
  return `${GIBS}/wmts/epsg3857/best/${layer}/default/${date}/${matrix}/{z}/{y}/{x}.png`;
}
export function legendUrl(name: string) {
  return `${GIBS}/legends/${name}`;
}

export async function buildH3Collection(
  boundary: FeatureCollection,
  resolution = 4,
): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  const features: Feature<Polygon | MultiPolygon>[] = [];
  for (const feature of boundary.features) {
    const geom = feature.geometry;
    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];
    for (const coords of polygons) {
      const cells = polygonToCells(coords as Position[][], resolution, true);
      for (const id of cells) {
        const geometry: Polygon = {
          type: "Polygon",
          coordinates: [cellToBoundary(id, true)],
        };
        features.push({
          type: "Feature",
          id,
          properties: { hexId: id, resolution },
          geometry,
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

export function hexAt(latitude: number, longitude: number, resolution = 4) {
  return latLngToCell(latitude, longitude, resolution);
}
export function hexCenter(id: string) {
  const [latitude, longitude] = cellToLatLng(id);
  return { latitude, longitude };
}
export function resolutionForZoom(zoom: number): 2 | 3 | 4 | 5 {
  return zoom < 4 ? 2 : zoom < 6 ? 3 : zoom < 9 ? 4 : 5;
}

export function localStyle(_boundary?: FeatureCollection): StyleSpecification {
  return FALLBACK_STYLE;
}
