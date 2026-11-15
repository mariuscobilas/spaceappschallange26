import type { CropType, GeoPolygon } from "@spaceapps/shared";
import type { AtlasCell } from "@spaceapps/shared";
import type { RegionalYieldDataset, RegionalYieldCrop, RegionalYieldPeriod } from "@spaceapps/shared";

export type { AtlasCell } from "@spaceapps/shared";

export type MapMode = "field" | "atlas";
export type TimeMode = "latest" | "past";
export type Overlay = "smap" | "ndvi" | "imerg" | "off";
export type BasemapId = "positron" | "liberty" | "dark" | "usgs-topo" | "usgs-imagery";
export type PreviewCrop = Extract<
  CropType,
  "wheat" | "corn" | "soybeans" | "cotton" | "sorghum"
>;
export interface Selection {
  latitude: number;
  longitude: number;
  name: string;
  benchmarkId?: string;
  hexId?: string;
  fieldId?: string;
  boundary?: GeoPolygon;
  areaHectares?: number;
}
export interface MapSettings {
  mode: MapMode;
  crop: PreviewCrop;
  timeMode: TimeMode;
  observationDate: string;
  overlay: Overlay;
  opacity: number;
  selection: Selection;
  /** Omitted in older stored settings; omission means the default Positron style. */
  basemap?: BasemapId;
  drought?: boolean;
}
export interface LayerInfo {
  id: Overlay;
  label: string;
  date: string;
  units: string;
  legend?: string;
  description: string;
}
export interface MapStatus {
  loading: boolean;
  message: string;
  failed: boolean;
  layer?: LayerInfo;
}
export interface BasemapStatus {
  selected: BasemapId;
  displayed: BasemapId | "local-fallback";
  state: "loading" | "ready" | "fallback";
}
export interface MapCanvasProps extends MapSettings {
  /** Explore selects geographic cells instead of placing field points. */
  hexBrowse?: boolean;
  onSelect: (selection: Selection) => void;
  onStatus: (status: MapStatus) => void;
  basemapRetry?: number;
  droughtRetry?: number;
  onDroughtStatus?: (status: "off" | "loading" | "ready" | "unavailable") => void;
  onBasemapStatus?: (status: BasemapStatus) => void;
  navigation: {
    action: "zoom-in" | "zoom-out" | "reset" | "selection";
    nonce: number;
  };
  retry: number;
  /** Caller filters this to one validated dataset crop/scenario selection. */
  atlasCells?: AtlasCell[];
  regionalYield?: { data: RegionalYieldDataset; crop: RegionalYieldCrop; period: RegionalYieldPeriod; selectedFips?: string; fitNonce?: number };
  regionalYieldActive?: boolean;
  onRegionalSelect?: (fips: string | null) => void;
  atlasSelectedH3?: string;
  onAtlasHover?: (cell: AtlasCell | null) => void;
  onAtlasRenderStatus?: (status: "idle" | "deck" | "fallback" | "unavailable") => void;
  onAtlasPerformance?: (sample: { layerUpdateMs: number; sampledFrameRate: number | null }) => void;
  drawing?: {
    mode: "browse" | "point" | "polygon" | "edit";
    boundary?: GeoPolygon;
    session: number;
    finish: number;
  };
  onBoundaryChange?: (boundary: GeoPolygon) => void;
  onDrawingStatus?: (message: string) => void;
  onMapReady?: (ready: boolean) => void;
  onDrawingReady?: (ready: boolean) => void;
}
