"use client";
import { useAtlasState } from "./AtlasContext";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ATLAS_LEGEND_STOPS, ATLAS_NO_DATA_COLOR, ATLAS_NO_ACREAGE_COLOR } from "@/lib/map/atlas-renderer";
import { safeLink } from "@/lib/atlas/data";
export function AtlasControls() {
  const state = useAtlasState(); if (!state) return null;
  const { data, loading, retry, cells, scenario, scenarioId, setScenarioId, renderer } = state;
  const active = cells.filter(c => c.activeAreaHa !== null && c.activeAreaHa > 0);
  const noActive = cells.length > 0 && cells.every(c => c.activeAreaHa === 0);
  return <section aria-label="Regional dataset controls" className="flex shrink-0 flex-col gap-2 border-b bg-background px-4 py-3">
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-full min-w-0 sm:w-64"><FieldLabel htmlFor="atlas-scenario">Management scenario</FieldLabel><NativeSelect id="atlas-scenario" value={scenarioId} disabled={!data?.scenarios.length || loading} onChange={e => setScenarioId(e.target.value)}>{!data?.scenarios.length && <NativeSelectOption value="">No scenarios available</NativeSelectOption>}{data?.scenarios.map(s => <NativeSelectOption value={s.id} key={s.id}>{s.label}</NativeSelectOption>)}</NativeSelect></Field>
      <Button variant="outline" onClick={retry} disabled={loading}>Refresh regional data</Button>
      <p role="status" className="min-w-0 flex-1 text-sm text-muted-foreground">{loading ? "Loading validated regional data…" : data?.status !== "available" ? data?.message ?? "Regional data unavailable" : noActive ? "No active acreage for this crop and scenario in the supplied coverage." : cells.length === 0 ? "No coverage for this crop and scenario. Missing coverage is not zero acreage." : `${cells.length} covered regions · ${active.length} with active crop area · ${renderer === "fallback" ? "Geographic rendering fallback" : renderer === "deck" ? "H3 regional layer" : "Preparing regional layer"}`}</p>
    </div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Net return legend and dataset sources</summary>
      <div className="mt-3 flex flex-wrap gap-3" aria-label="Net return legend">{ATLAS_LEGEND_STOPS.map(stop => <span className="flex items-center gap-1" key={stop.value}><span className="size-4 rounded-sm border" style={{backgroundColor:stop.color}} />{stop.label}</span>)}<span className="flex items-center gap-1"><span className="size-4 border" style={{backgroundColor:ATLAS_NO_DATA_COLOR}}/>Unavailable return</span><span className="flex items-center gap-1"><span className="size-4 border" style={{backgroundColor:ATLAS_NO_ACREAGE_COLOR}}/>No active acreage</span></div>
      <p className="mt-2">Incremental USD/ha relative to the scenario baseline. Fixed ±$200/ha scale clips extreme values. Neutral means zero return only when a numeric result is present. Uncovered geography is not assessed.</p>
      {scenario && <p className="mt-2">{scenario.periodStart} to {scenario.periodEnd} · Baseline: {scenario.baseline}. NASA imagery dates are independent of this analysis period.</p>}
      {data?.validation && <p className="mt-2">Dataset: {data.datasetId} · Generated {data.generatedAt} · Declared validation: {data.validation.method} · {data.validation.reference}</p>}
      <ul className="mt-2 flex flex-col gap-1">{data?.provenance.map((p,i) => <li key={i}>{safeLink(p.url) ? <a href={p.url} target="_blank" rel="noreferrer" className="underline">{p.title}</a> : p.title} · {p.spatialMeaning}</li>)}</ul>
    </details>
  </section>;
}
export function AtlasHover({ cell }: { cell: import("@spaceapps/shared").AtlasCell }) {
  return <div role="tooltip" className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg border bg-background p-3 text-xs shadow-sm"><p className="font-medium">{cell.h3Index}</p><dl className="mt-2 grid grid-cols-2 gap-2"><dt>Net change</dt><dd>{cell.netReturnUsdHa === null ? "Unavailable" : `${cell.netReturnUsdHa.toFixed(2)} USD/ha`}</dd><dt>Yield penalty</dt><dd>{cell.yieldPenaltyPct === null ? "Unavailable" : `${cell.yieldPenaltyPct}%`}</dd><dt>Root-zone wetness</dt><dd>{cell.rootZoneWetness === null ? "Unavailable" : `${Math.round(cell.rootZoneWetness * 100)}%`}</dd><dt>Soil texture</dt><dd>{cell.soilTexture ?? "Unavailable"}</dd><dt>Active crop area</dt><dd>{cell.activeAreaHa === null ? "Unavailable" : `${cell.activeAreaHa} ha`}</dd></dl><p className="mt-2">Click to inspect evidence and soil details.</p></div>;
}
