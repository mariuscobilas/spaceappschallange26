import type { CropType, GeoCoordinate, GeoPolygon } from "./field";

/** A locally saved field selection and its provenance. */
export interface SavedField {
  id: string;
  name: string;
  location: GeoCoordinate;
  boundary?: GeoPolygon;
  areaHectares?: number;
  currentCrop: CropType;
  cropSource: "manual" | "cdl";
  benchmarkId?: string;
  createdAt: string;
  updatedAt: string;
}

/** USDA Cropland Data Layer lookup result at one sample coordinate. */
export interface LandCoverResult {
  status: "cropland" | "non_cropland" | "unavailable";
  code: number | null;
  category: string | null;
  suggestedCrop: CropType | null;
  year: number | null;
  requestedYear: number;
  sample: GeoCoordinate;
  source: string;
  message: string;
}
