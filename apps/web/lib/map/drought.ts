import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map, ErrorEvent } from "maplibre-gl";
import metadata from "@/data/usdm.json";

export { metadata as DROUGHT_DATASET };
export const DROUGHT_CLASSES = [
  { value: 0, label: "D0 · Abnormally dry", color: "#FFFF00" },
  { value: 1, label: "D1 · Moderate drought", color: "#FCD37F" },
  { value: 2, label: "D2 · Severe drought", color: "#FFAA00" },
  { value: 3, label: "D3 · Extreme drought", color: "#E60000" },
  { value: 4, label: "D4 · Exceptional drought", color: "#730000" },
] as const;
export type DroughtStatus = "off" | "loading" | "ready" | "unavailable";
const SOURCE = "usdm-observation";
type DroughtCollection = FeatureCollection<Polygon | MultiPolygon, { DM: number }>;
let cached: Promise<DroughtCollection> | undefined;
async function loadDataset() {
  if (!cached) cached = fetch(`/data/usdm-${metadata.asOf}.geojson`, { signal: AbortSignal.timeout(10000) }).then(async response => {
    if (!response.ok) throw new Error("Drought dataset unavailable");
    const data = await response.json() as DroughtCollection;
    if (data.type !== "FeatureCollection" || !data.features.length || data.features.length > 5 || data.features.some(f => !Number.isInteger(f.properties?.DM) || f.properties.DM < 0 || f.properties.DM > 4 || !["Polygon", "MultiPolygon"].includes(f.geometry?.type))) throw new Error("Invalid drought dataset");
    return data;
  }).catch(error => { cached = undefined; throw error; });
  return cached;
}
/** Display-only regional assessment. Never used to calculate field or Atlas predictions. */
export function createDroughtOverlay(map: Map, report: (status: DroughtStatus) => void) {
  let generation = 0;
  let disposed = false;
  let active = false;
  let failed = false;
  const onSource = (event: { sourceId: string; isSourceLoaded?: boolean }) => {
    if (active && !failed && event.sourceId === SOURCE && event.isSourceLoaded) report("ready");
  };
  const onError = (event: ErrorEvent) => {
    if ((event as ErrorEvent & { sourceId?: string }).sourceId === SOURCE) { failed = true; report("unavailable"); }
  };
  map.on("error", onError);
  map.on("sourcedata", onSource);
  return {
    async sync(enabled: boolean) {
      const current = ++generation;
      active = enabled;
      failed = false;
      if (!enabled) {
        if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
        report("off");
        return;
      }
      report("loading");
      try {
        const data = await loadDataset();
        if (disposed || current !== generation || !map.getSource("field-h3")) return;
        if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data, attribution: 'U.S. Drought Monitor: NDMC, USDA, NOAA, NASA · <a href="https://droughtmonitor.unl.edu/">NDMC</a>', tolerance: 0.5 });
        if (!map.getLayer(SOURCE)) {
          const before = map.getStyle().layers?.find(l => l.type === "symbol" || l.id === "field-selection-fill" || l.id.startsWith("field-draw"))?.id;
          map.addLayer({ id: SOURCE, type: "fill", source: SOURCE, paint: {
            "fill-color": ["match", ["get", "DM"], 0, "#FFFF00", 1, "#FCD37F", 2, "#FFAA00", 3, "#E60000", 4, "#730000", "transparent"],
            "fill-opacity": 0.45,
          } }, before);
        }
        if (map.isSourceLoaded(SOURCE)) report("ready");
      } catch { if (!disposed && current === generation) report("unavailable"); }
    },
    dispose() { disposed = true; generation++; map.off("error", onError); map.off("sourcedata", onSource); },
  };
}
