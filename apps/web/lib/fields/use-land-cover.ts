"use client";
import { useEffect, useState } from "react";
import type { LandCoverResult, GeoCoordinate } from "@spaceapps/shared";
export function useLandCover(
  point: GeoCoordinate | undefined,
  year: number,
  enabled: boolean,
) {
  const [retry, setRetry] = useState(0),
    [state, setState] = useState<{ key: string; result: LandCoverResult }>();
  const key = point
    ? `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}|${year}|${retry}`
    : "";
  useEffect(() => {
    if (!enabled || !point) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    const sample = { latitude: point.latitude, longitude: point.longitude };
    const unavailable = (): LandCoverResult => ({
      status: "unavailable",
      code: null,
      category: null,
      suggestedCrop: null,
      year: null,
      requestedYear: year,
      sample,
      source: "USDA Cropland Data Layer",
      message:
        "Land cover could not be verified. Select a crop manually or retry.",
    });
    const base = (
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    ).replace(/\/$/, "");
    void fetch(
      `${base}/api/v1/land-cover?${new URLSearchParams({ latitude: String(sample.latitude), longitude: String(sample.longitude), year: String(year) })}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw Error("Lookup unavailable");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object")
          throw Error("Invalid land cover result");
        const result = value as LandCoverResult;
        if (
          !["cropland", "non_cropland", "unavailable"].includes(
            result.status,
          ) ||
          result.requestedYear !== year ||
          typeof result.message !== "string" ||
          typeof result.source !== "string" ||
          !result.sample ||
          Math.abs(result.sample.latitude - sample.latitude) > 1e-5 ||
          Math.abs(result.sample.longitude - sample.longitude) > 1e-5 ||
          (result.status !== "unavailable" &&
            (!Number.isInteger(result.year) ||
              typeof result.category !== "string"))
        )
          throw Error("Invalid land cover result");
        if (!disposed) setState({ key, result });
      })
      .catch(() => {
        if (!disposed) setState({ key, result: unavailable() });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [key, enabled]);
  return {
    result: state?.key === key ? state.result : undefined,
    loading: enabled && !!point && state?.key !== key,
    retry: () => setRetry((v) => v + 1),
  };
}
