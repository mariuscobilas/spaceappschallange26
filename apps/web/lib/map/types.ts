import type { CropType, GeoPolygon } from "@spaceapps/shared";

export type MapMode = "field" | "atlas";
export type TimeMode = "latest" | "past";
export type Overlay = "smap" | "ndvi" | "imerg" | "off";
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
export interface MapCanvasProps extends MapSettings {
  onSelect: (selection: Selection) => void;
  onStatus: (status: MapStatus) => void;
  navigation: {
    action: "zoom-in" | "zoom-out" | "reset" | "selection";
    nonce: number;
  };
  retry: number;
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
