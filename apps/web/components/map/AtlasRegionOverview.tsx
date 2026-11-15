"use client";

import { useState } from "react";
import { useAtlasState } from "@/components/atlas/AtlasContext";
import { SoilProfile } from "@/components/atlas/SoilProfile";
import { cellArea, cellToLatLng, getResolution, isValidCell, UNITS } from "h3-js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { FieldConditions } from "@/components/fields/FieldConditions";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { crops, today } from "@/lib/workspace";

export function AtlasRegionOverview({ enabled }: { enabled: boolean }) {
  const { settings } = useMeridian();
  const atlas = useAtlasState();
  const [showSoil, setShowSoil] = useState(false);
  const record = atlas?.cells.find(c => c.h3Index === settings.selection.hexId);
  const noAcreage = record?.activeAreaHa === 0;
  const number = (v: number | null | undefined, unit: string) => v === null || v === undefined ? "Unavailable" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v)} ${unit}`;

  const hexId = settings.selection.hexId;
  const validHex = !!hexId && isValidCell(hexId);
  const asOf = settings.timeMode === "past" ? settings.observationDate : today();
  const crop = crops.find((item) => item.value === settings.crop)?.label;
  if (!validHex) return <Empty>
    <EmptyHeader>
      <EmptyTitle>Select a region</EmptyTitle>
      <EmptyDescription>Click a hexagon to inspect its geography and conditions, then choose a field within it.</EmptyDescription>
    </EmptyHeader>
  </Empty>;
  const [latitude, longitude] = cellToLatLng(hexId);
  const area = cellArea(hexId, UNITS.km2);
  return <div className="flex flex-col gap-4" aria-label="Atlas region details">
    <Card size="sm">
      <CardHeader>
        <CardTitle>Region at a glance</CardTitle>
        <CardDescription>{crop} · {settings.timeMode === "past" ? `Past conditions · ${asOf}` : "Latest available conditions"}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Full hexagon area</dt>
          <dd className="text-right font-medium tabular-nums">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(area)} km²</dd>
          <dt className="text-muted-foreground">Hex centre</dt>
          <dd className="text-right tabular-nums">{latitude.toFixed(4)}, {longitude.toFixed(4)}</dd>
          <dt className="text-muted-foreground">Grid detail</dt>
          <dd className="text-right">H3 resolution {getResolution(hexId)}</dd>
          <dt className="text-muted-foreground">Region ID</dt>
          <dd className="break-all text-right font-mono text-xs">{hexId}</dd>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Hexagon area includes all land uses and any water within the cell. It is not planted acreage or a field boundary.</p>
      </CardContent>
    </Card>
    <section className="flex flex-col gap-2" aria-label="Conditions at region centre">
      <div>
        <h3 className="font-medium">Conditions at the centre</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">Source-backed context at one sample point. These readings are not averages across this hexagon.</p>
      </div>
      <FieldConditions compact point={{ latitude, longitude }} asOf={asOf} enabled={enabled} />
    </section>
    <Card size="sm">
      <CardHeader>
        <CardTitle>Regional assessment</CardTitle>
        <CardDescription>{atlas?.loading ? "Loading regional assessment…" : noAcreage ? "No active acreage for the selected crop in this region." : !record ? "No validated assessment for this region and filter combination." : `${atlas?.scenario?.label} · ${atlas?.scenario?.periodStart} to ${atlas?.scenario?.periodEnd}`}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Net return</dt><dd>{number(record?.netReturnUsdHa, "USD/ha")}</dd>
          <dt className="text-muted-foreground">Yield penalty</dt><dd>{number(record?.yieldPenaltyPct, "%")}</dd>
          <dt className="text-muted-foreground">Active {crop?.toLowerCase()} area</dt><dd>{number(record?.activeAreaHa, "ha")}</dd>
          <dt className="text-muted-foreground">Regional root-zone wetness</dt><dd>{number(record?.rootZoneWetness === null || record?.rootZoneWetness === undefined ? null : record.rootZoneWetness * 100, "%")}</dd>
          <dt className="text-muted-foreground">Regional soil texture</dt><dd>{record?.soilTexture ?? "Unavailable"}</dd>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Missing crop coverage is not zero acreage. Negative yield penalty means a yield gain relative to the declared baseline. Regional values come only from the supplied dataset; point observations below do not replace missing aggregates.</p>
      </CardContent>
    </Card>
    <details onToggle={e => setShowSoil(e.currentTarget.open)} className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Soil texture and horizon characteristics at centre</summary>{showSoil && <div className="mt-3"><SoilProfile key={hexId} latitude={latitude} longitude={longitude} /></div>}</details>
  </div>;
}
