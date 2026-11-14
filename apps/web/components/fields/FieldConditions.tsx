"use client";

import type { FieldConditionMeasure, GeoCoordinate } from "@spaceapps/shared";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useFieldConditions } from "@/lib/fields/use-field-conditions";

type Props = {
  point: GeoCoordinate | undefined;
  asOf: string;
  enabled?: boolean;
  compact?: boolean;
};

function sourceLink(measure: FieldConditionMeasure) {
  try {
    const url = new URL(measure.sourceUrl);
    if (url.protocol === "https:" && ["nasa.gov", "usda.gov"].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
      return <a className="underline underline-offset-2 hover:text-foreground" href={url.href} target="_blank" rel="noreferrer">{measure.source}</a>;
    }
  } catch { /* Hide links for malformed or untrusted source URLs. */ }
  return <span>{measure.source}</span>;
}

function periodText(measure: FieldConditionMeasure, kind: "precipitation" | "wetness" | "map") {
  if (kind === "map") return "Mapped 0–100 cm soil profile";
  if (!measure.periodStart || !measure.periodEnd) return "Observation period unavailable";
  if (kind === "wetness") return `Gridded estimate for ${measure.periodEnd}`;
  return `${measure.periodStart} to ${measure.periodEnd} · 30-day total`;
}

function Metric({ label, measure, kind }: { label: string; measure: FieldConditionMeasure; kind: "precipitation" | "wetness" | "map" }) {
  const available = measure.status === "available" && measure.value !== null;
  const value = !available ? "Unavailable" : kind === "wetness"
    ? `${Math.round(measure.value! * 100)}%`
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(measure.value!)} mm`;
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{periodText(measure, kind)}</p>
        {kind === "wetness" && <p className="text-xs text-muted-foreground">Relative saturation · 0–100 cm</p>}
        {kind === "map" && <p className="text-xs text-muted-foreground">Mapped available water storage capacity, not water remaining</p>}
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums" aria-label={`${label}: ${value}`}>{value}</p>
    </div>
  );
}

export function FieldConditions({ point, asOf, enabled = true, compact = false }: Props) {
  const { result, loading, retry } = useFieldConditions(point, asOf, enabled);
  const measures = result && [result.precipitation30d, result.rootZoneWetness, result.availableWaterStorage];
  const hasUnavailable = measures?.some((measure) => measure.status === "unavailable");
  const allUnavailable = measures?.every((measure) => measure.status === "unavailable");
  const retryAction = <Button type="button" size="sm" variant="outline" onClick={retry} aria-label="Refresh field conditions">
    <RefreshCw data-icon="inline-start" /> {hasUnavailable ? "Retry" : "Refresh"}
  </Button>;

  if (!enabled || !point) return null;
  if (loading) {
    const content = <div className="flex flex-col gap-3" aria-label="Loading field conditions" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>;
    return <Card size="sm" role="region" aria-label="Field conditions" aria-busy="true"><CardContent className="pt-3">{content}</CardContent></Card>;
  }
  if (!result) return null;

  const body = <>
    {hasUnavailable && <Alert className="mb-3">
      <AlertTitle>{allUnavailable ? "Conditions unavailable" : "Some measurements are unavailable"}</AlertTitle>
      <AlertDescription>{allUnavailable ? "The sources could not be verified. Retry when connected; your plan remains editable." : "Available readings are shown below. Missing readings remain unavailable."}</AlertDescription>
    </Alert>}
    <div className="flex flex-col divide-y">
      <Metric label="30-day precipitation" measure={result.precipitation30d} kind="precipitation" />
      <Metric label="Root-zone wetness" measure={result.rootZoneWetness} kind="wetness" />
      <Metric label="Available water storage" measure={result.availableWaterStorage} kind="map" />
    </div>
    {result.soilMapUnit && <p className="mt-2 text-xs text-muted-foreground">Mapped soil unit: {result.soilMapUnit}</p>}
    <Separator className="my-3" />
    <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sources and interpretation</summary>
      <ul className="mt-2 flex flex-col gap-2">
        <li><span className="font-medium text-foreground">30-day precipitation.</span> {sourceLink(result.precipitation30d)} · {result.precipitation30d.spatialResolution}. Gridded meteorological reanalysis. {result.precipitation30d.message}</li>
        <li><span className="font-medium text-foreground">Root-zone wetness.</span> {sourceLink(result.rootZoneWetness)} · {result.rootZoneWetness.spatialResolution}. Modeled relative saturation, not volumetric water content or plant-available water. {result.rootZoneWetness.message}</li>
        <li><span className="font-medium text-foreground">Available water storage.</span> {sourceLink(result.availableWaterStorage)} · {result.availableWaterStorage.spatialResolution}. {result.availableWaterStorage.message}</li>
      </ul>
      <p className="mt-2">Soil water storage is mapped capacity for the 0–100 cm profile, not current moisture. Point or grid estimates and mapped soil context are not field-wide measurements. Checked {new Date(result.retrievedAt).toLocaleString()}.</p>
    </details>
  </>;

  return <Card size="sm" role="region" aria-label="Field conditions">
    <CardHeader className={compact ? "grid-cols-[1fr_auto]" : undefined}>
      <CardTitle>Field conditions</CardTitle>
      {compact ? <CardDescription>As of {result.requestedDate}</CardDescription> : <CardDescription>Source-backed context as of {result.requestedDate}</CardDescription>}
      <CardAction>{retryAction}</CardAction>
    </CardHeader>
    <CardContent>{body}</CardContent>
  </Card>;
}
