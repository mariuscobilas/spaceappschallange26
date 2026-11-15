"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  FieldConditionMeasure,
  FieldConditionsResult,
  GeoCoordinate,
} from "@spaceapps/shared";

const DAY_MS = 86_400_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 32;
const MAX_IN_FLIGHT = 16;
const isoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function trustedSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["nasa.gov", "usda.gov"].some((domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      );
  } catch {
    return false;
  }
}

function validMeasure(value: unknown, unit: FieldConditionMeasure["unit"]): value is FieldConditionMeasure {
  if (!value || typeof value !== "object") return false;
  const measure = value as FieldConditionMeasure;
  if (
    !["available", "unavailable"].includes(measure.status) ||
    measure.unit !== unit ||
    !(measure.value === null || (typeof measure.value === "number" && Number.isFinite(measure.value) && measure.value >= 0)) ||
    (unit === "fraction" && measure.value !== null && measure.value > 1) ||
    typeof measure.source !== "string" ||
    !trustedSourceUrl(measure.sourceUrl) ||
    typeof measure.spatialResolution !== "string" ||
    typeof measure.message !== "string"
  ) return false;
  if (measure.status === "available" && measure.value === null) return false;
  if (measure.status === "unavailable" && measure.value !== null) return false;
  const hasStart = measure.periodStart !== null;
  const hasEnd = measure.periodEnd !== null;
  if (hasStart !== hasEnd) return false;
  return (!hasStart || isoDate(measure.periodStart)) &&
    (!hasEnd || isoDate(measure.periodEnd));
}

function validResult(value: unknown, point: GeoCoordinate, requestedDate: string): value is FieldConditionsResult {
  if (!value || typeof value !== "object") return false;
  const result = value as FieldConditionsResult;
  if (
    !result.sample || !Number.isFinite(result.sample.latitude) || !Number.isFinite(result.sample.longitude) ||
    Math.abs(result.sample.latitude - point.latitude) > 1e-6 ||
    Math.abs(result.sample.longitude - point.longitude) > 1e-6 ||
    result.requestedDate !== requestedDate || !isoDate(result.requestedDate) ||
    typeof result.retrievedAt !== "string" || Number.isNaN(Date.parse(result.retrievedAt)) ||
    !(result.soilMapUnit === null || typeof result.soilMapUnit === "string") ||
    !validMeasure(result.precipitation30d, "mm") ||
    !validMeasure(result.rootZoneWetness, "fraction") ||
    !validMeasure(result.availableWaterStorage, "mm")
  ) return false;

  const rain = result.precipitation30d;
  for (const measure of [rain, result.rootZoneWetness]) {
    if (measure.periodStart && measure.periodEnd &&
      (measure.periodStart > measure.periodEnd || measure.periodEnd > requestedDate)) return false;
  }
  if (rain.status === "available" && (!rain.periodStart || !rain.periodEnd ||
      Date.parse(`${rain.periodEnd}T00:00:00Z`) - Date.parse(`${rain.periodStart}T00:00:00Z`) !== 29 * DAY_MS)) return false;
  const wetness = result.rootZoneWetness;
  if (wetness.status === "available" && (!wetness.periodStart || wetness.periodStart !== wetness.periodEnd)) return false;
  if (result.availableWaterStorage.periodStart !== null || result.availableWaterStorage.periodEnd !== null) return false;
  return true;
}

export function useFieldConditions(
  point: GeoCoordinate | undefined,
  asOf: string,
  enabled: boolean,
) {
  const [state, setState] = useState<{ key: string; result: FieldConditionsResult }>();
  const sample = point ? { latitude: point.latitude, longitude: point.longitude } : undefined;
  const baseKey = sample ? `${sample.latitude},${sample.longitude}|${asOf}` : "";
  const subscribeEpoch = useCallback((listener: () => void) => subscribeRefresh(baseKey, listener), [baseKey]);
  const getEpoch = useCallback(() => refreshEpochs.get(baseKey) ?? 0, [baseKey]);
  const epoch = useSyncExternalStore(subscribeEpoch, getEpoch, () => 0);
  const key = `${baseKey}|${epoch}`;

  useEffect(() => {
    if (!enabled || !sample || !isoDate(asOf) ||
        !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return;
    let disposed = false;
    const subscription = subscribeConditions(baseKey, epoch, sample, asOf);
    void subscription.promise.then((result) => {
      if (!disposed && result) setState({ key, result });
    });
    return () => { disposed = true; subscription.release(); };
  }, [key, baseKey, epoch, enabled, sample?.latitude, sample?.longitude, asOf]);

  return {
    result: state?.key === key ? state.result : undefined,
    loading: enabled && !!sample && isoDate(asOf) && state?.key !== key,
    retry: useCallback(() => refreshConditions(baseKey), [baseKey]),
  };
}

type Subscription = { promise: Promise<FieldConditionsResult | undefined>; release: () => void };
type InFlight = { controller: AbortController; promise: Promise<FieldConditionsResult | undefined>; subscribers: number; settled: boolean };
const cache = new Map<string, { expiresAt: number; result: FieldConditionsResult }>();
const inFlight = new Map<string, InFlight>();
const refreshEpochs = new Map<string, number>();
const refreshListeners = new Map<string, Set<() => void>>();

function subscribeRefresh(key: string, listener: () => void) {
  if (!key) return () => {};
  let listeners = refreshListeners.get(key);
  if (!listeners) { listeners = new Set(); refreshListeners.set(key, listeners); }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      refreshListeners.delete(key);
      refreshEpochs.delete(key);
    }
  };
}

function refreshConditions(key: string) {
  if (!key) return;
  cache.delete(key);
  refreshEpochs.set(key, (refreshEpochs.get(key) ?? 0) + 1);
  for (const listener of refreshListeners.get(key) ?? []) listener();
}

function cacheResult(key: string, epoch: number, result: FieldConditionsResult) {
  if ((refreshEpochs.get(key) ?? 0) !== epoch) return;
  const complete = [result.precipitation30d, result.rootZoneWetness, result.availableWaterStorage]
    .every((measure) => measure.status === "available");
  cache.delete(key);
  cache.set(key, { result, expiresAt: Date.now() + (complete ? CACHE_TTL_MS : 30_000) });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
}

function fallbackResult(sample: GeoCoordinate, asOf: string): FieldConditionsResult {
  const measure = (unit: FieldConditionMeasure["unit"], source: string, sourceUrl: string, message: string): FieldConditionMeasure => ({
    status: "unavailable", value: null, unit, periodStart: null, periodEnd: null,
    source, sourceUrl, spatialResolution: "Not available", message,
  });
  return {
    sample, requestedDate: asOf, retrievedAt: new Date().toISOString(),
    precipitation30d: measure("mm", "NASA POWER", "https://power.larc.nasa.gov/", "Precipitation data could not be verified. Retry when connected."),
    rootZoneWetness: measure("fraction", "NASA POWER", "https://power.larc.nasa.gov/", "Root-zone wetness could not be verified. Retry when connected."),
    availableWaterStorage: measure("mm", "USDA NRCS Web Soil Survey", "https://websoilsurvey.nrcs.usda.gov/", "Mapped soil water capacity could not be verified. Retry when connected."),
    soilMapUnit: null,
  };
}

function subscribeConditions(key: string, epoch: number, sample: GeoCoordinate, asOf: string): Subscription {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key); cache.set(key, cached);
    return { promise: Promise.resolve(cached.result), release: () => {} };
  }
  if (cached && cached.expiresAt <= Date.now()) cache.delete(key);
  const requestKey = `${key}|${epoch}`;
  let request = inFlight.get(requestKey);
  if (!request && inFlight.size >= MAX_IN_FLIGHT) {
    return { promise: Promise.resolve(fallbackResult(sample, asOf)), release: () => {} };
  }
  if (!request) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
    const query = new URLSearchParams({ latitude: String(sample.latitude), longitude: String(sample.longitude), as_of: asOf });
    const created: InFlight = {
      controller, subscribers: 0, settled: false,
      promise: fetch(`${base}/api/v1/field-conditions?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Field conditions unavailable");
          const body: unknown = await response.json();
          if (!validResult(body, sample, asOf)) throw new Error("Invalid field conditions response");
          return body;
        })
        .catch((error) => {
          if (controller.signal.aborted && !timedOut) return undefined;
          return fallbackResult(sample, asOf);
        })
        .then((result) => {
          if (result && !controller.signal.aborted) cacheResult(key, epoch, result);
          return result;
        })
        .finally(() => {
          created.settled = true;
          window.clearTimeout(timeout);
          if (inFlight.get(requestKey) === created) inFlight.delete(requestKey);
        }),
    };
    request = created;
    inFlight.set(requestKey, request);
  }
  request.subscribers++;
  let released = false;
  const current = request;
  return {
    promise: current.promise,
    release: () => {
      if (released) return;
      released = true;
      current.subscribers--;
      if (!current.settled && current.subscribers === 0) {
        queueMicrotask(() => {
          if (current.settled || current.subscribers > 0) return;
          current.controller.abort();
          if (inFlight.get(requestKey) === current) inFlight.delete(requestKey);
        });
      }
    },
  };
}
