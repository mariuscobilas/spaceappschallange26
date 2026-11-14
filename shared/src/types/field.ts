/**
 * Field, farm, and geographic data contracts.
 */

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  altitudeMeters?: number | null;
}

export interface GeoPolygon {
  type: "Polygon";
  /** Coordinates array of [longitude, latitude] pairs */
  coordinates: [number, number][][];
}

export type CropType =
  | "corn"
  | "wheat"
  | "soybeans"
  | "barley"
  | "cotton"
  | "rice"
  | "sorghum"
  | "sunflower"
  | "grapes"
  | "potatoes"
  | "other";

export type SoilType =
  | "clay"
  | "sandy_clay"
  | "silty_clay"
  | "clay_loam"
  | "sandy_clay_loam"
  | "silty_clay_loam"
  | "loam"
  | "sandy_loam"
  | "loamy_sand"
  | "sand"
  | "silt_loam"
  | "silt";

export type IrrigationType =
  | "rainfed"
  | "drip"
  | "sprinkler"
  | "center_pivot"
  | "furrow_flood"
  | "none";

export interface FieldProfile {
  id: string;
  name: string;
  location: GeoCoordinate;
  boundary?: GeoPolygon;
  areaHectares: number;
  currentCrop: CropType;
  plantingDate?: string; // ISO 8601 YYYY-MM-DD
  soilType: SoilType;
  irrigation: IrrigationType;
  notes?: string;
}

