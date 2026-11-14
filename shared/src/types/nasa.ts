/**
 * NASA Earth observation & satellite environmental metrics contracts.
 * Common data products: MODIS/Landsat (NDVI/LST), SMAP (soil moisture), GPM (precipitation).
 */

export interface NasaObservationPoint {
  date: string; // ISO 8601 YYYY-MM-DD
  /** Normalized Difference Vegetation Index (-1.0 to 1.0) */
  ndvi: number;
  /** Volumetric soil moisture fraction (0.0 to 1.0) e.g. SMAP L4 */
  soilMoistureVwc: number;
  /** Land surface temperature in Celsius (MODIS/Landsat) */
  surfaceTemperatureCelsius: number;
  /** Daily precipitation in mm (NASA GPM IMERG) */
  precipitationMm: number;
  /** Solar radiation / insolation (MJ/m^2/day or W/m^2) */
  solarRadiationWm2?: number;
}

export interface ClimateTrend {
  warmingRatePerDecadeCelsius: number;
  precipitationTrendPct: number;
  extremeHeatDaysProjected: number;
  consecutiveDryDaysAverage: number;
}

export interface NasaEnvironmentalSnapshot {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  observationDate: string;
  currentNdvi: number;
  historicalAverageNdvi: number;
  ndviAnomaly: number;
  soilMoistureCurrent: number;
  soilMoistureDeficitPct: number;
  temperatureAnomalyCelsius: number;
  recentPrecipitation7dMm: number;
  projectedPrecipitation30dMm: number;
  droughtSeverityIndex: number; // e.g. Palmer or SPEI scale: -4.0 (extreme drought) to +4.0 (extremely wet)
  climateTrends?: ClimateTrend;
}

