import type { StyleSpecification } from "maplibre-gl";
import type { BasemapId } from "@/lib/map/types";

export const DEFAULT_BASEMAP: BasemapId = "positron";

export const BASEMAP_OPTIONS: {
  value: BasemapId;
  label: string;
  provider: string;
  description: string;
  sourceNote: string;
}[] = [
  { value: "positron", label: "Light", provider: "OpenFreeMap", description: "A light, low-contrast street map.", sourceNote: "OpenStreetMap data via OpenFreeMap." },
  { value: "liberty", label: "Streets", provider: "OpenFreeMap", description: "A detailed street map with place labels.", sourceNote: "OpenStreetMap data via OpenFreeMap." },
  { value: "dark", label: "Dark", provider: "OpenFreeMap", description: "A dark street map for low-light viewing.", sourceNote: "OpenStreetMap data via OpenFreeMap." },
  { value: "usgs-topo", label: "USGS topographic", provider: "USGS The National Map", description: "Topographic reference with contours, hydrography, roads, and shaded relief.", sourceNote: "USGS The National Map, public-domain reference layers; refreshed September 2026." },
  { value: "usgs-imagery", label: "USGS aerial imagery", provider: "USGS The National Map", description: "Aerial orthoimagery. Coverage and image dates vary by location.", sourceNote: "USGS imagery includes NAIP collections; imagery is not live and vintage varies by location." },
];

export function isBasemapId(value: unknown): value is BasemapId {
  return typeof value === "string" && BASEMAP_OPTIONS.some((option) => option.value === value);
}

export function getBasemapStyle(id: BasemapId | undefined): string | StyleSpecification {
  const selected = id ?? DEFAULT_BASEMAP;
  if (selected === "usgs-topo" || selected === "usgs-imagery") {
    const service = selected === "usgs-topo" ? "USGSTopo" : "USGSImageryOnly";
    const attribution = selected === "usgs-topo"
      ? "USGS The National Map"
      : "USGS The National Map · USDA NAIP imagery (vintage varies; not live)";
    return {
      version: 8,
      sources: {
        "national-map": {
          type: "raster",
          tiles: [`https://basemap.nationalmap.gov/arcgis/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`],
          tileSize: 256,
          maxzoom: selected === "usgs-topo" ? 16 : 23,
          attribution,
        },
      },
      layers: [{ id: "national-map-basemap", type: "raster", source: "national-map" }],
    };
  }
  return `https://tiles.openfreemap.org/styles/${selected}`;
}
