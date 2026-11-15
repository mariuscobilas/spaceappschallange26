"use client";
import { useEffect, useState } from "react";
import type { SoilProfileResult, SoilMeasure } from "@spaceapps/shared";
import { Button } from "@/components/ui/button";
import { safeLink } from "@/lib/atlas/data";
const display = (m: SoilMeasure) => m.status === "available" && m.value !== null ? `${m.value}${m.unit && !["class", "group", "textural class"].includes(m.unit) ? ` ${m.unit}` : ""}` : "Unavailable";
const validMeasure = (m: SoilMeasure) => !!m && ["available", "unavailable"].includes(m.status) && typeof m.unit === "string" && typeof m.message === "string" && safeLink(m.sourceUrl) && (m.status === "unavailable" ? m.value === null : (typeof m.value === "string" || typeof m.value === "number" && Number.isFinite(m.value)));
function validProfile(v: SoilProfileResult, latitude: number, longitude: number) {
  return !!v && ["available", "unavailable"].includes(v.status) && !!v.sample && Math.abs(v.sample.latitude - latitude) < 1e-6 && Math.abs(v.sample.longitude - longitude) < 1e-6 && typeof v.message === "string" && safeLink(v.sourceUrl) && Number.isFinite(Date.parse(v.retrievedAt)) && Array.isArray(v.components) && v.components.length <= 10 && v.components.every(c => c && typeof c.componentName === "string" && typeof c.mapUnitName === "string" && validMeasure(c.drainageClass) && validMeasure(c.hydrologicGroup) && Array.isArray(c.horizons) && c.horizons.length <= 100 && c.horizons.every(h => Number.isFinite(h.topCm) && Number.isFinite(h.bottomCm) && h.topCm >= 0 && h.bottomCm > h.topCm && [h.texture,h.sandPct,h.siltPct,h.clayPct,h.organicMatterPct,h.bulkDensityGcm3,h.ph,h.saturatedConductivityUmS].every(validMeasure)));
}
export function SoilProfile({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: SoilProfileResult | null }>();
  const key = `${latitude},${longitude}|${attempt}`;
  useEffect(() => {
    const controller = new AbortController(); let disposed = false;
    const timer = setTimeout(() => controller.abort(), 10000);
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
    void fetch(`${base}/api/v1/soil-profile?latitude=${latitude}&longitude=${longitude}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw Error();
      const data = await r.json();
      if (!validProfile(data, latitude, longitude)) throw Error();
      return data as SoilProfileResult;
    }).catch(() => null).then(data => { if (!disposed) setState({ key, data }); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [key, latitude, longitude]);
  const data = state?.key === key ? state.data : undefined;
  return <section aria-label="Mapped soil profile" className="flex flex-col gap-3 rounded-lg border p-4">
    <div className="flex items-start justify-between gap-2"><h3 className="font-medium">Mapped soil profile</h3><Button size="sm" variant="outline" onClick={() => setAttempt(n => n + 1)}>Refresh soil</Button></div>
    <p className="text-xs text-muted-foreground">Dominant mapped component at the hex centre. Horizon properties describe the current survey, not a regional average or historical soil observation.</p>
    {data === undefined ? <p role="status">Loading soil profile…</p> : !data || data.status === "unavailable" ? <p role="status" className="text-sm text-muted-foreground">{data?.message ?? "Soil properties could not be verified. Retry when connected."}</p> : data.components.map((c,i) => <div key={i} className="flex flex-col gap-3 text-sm">
      <p className="font-medium">{c.mapUnitSymbol} · {c.mapUnitName}</p><p>{c.componentName} · {c.componentPercent === null ? "Share unavailable" : `${c.componentPercent}% of map unit`}</p>
      <dl className="grid grid-cols-2 gap-2"><dt>Drainage</dt><dd>{display(c.drainageClass)}</dd><dt>Hydrologic group</dt><dd>{display(c.hydrologicGroup)}</dd></dl>
      {c.horizons.map((h,j) => <details key={j} open={j === 0} className="rounded-md border p-3"><summary className="cursor-pointer font-medium">{h.topCm}–{h.bottomCm} cm · {display(h.texture)}</summary><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{[["Sand",h.sandPct],["Silt",h.siltPct],["Clay",h.clayPct],["Organic matter",h.organicMatterPct],["Bulk density",h.bulkDensityGcm3],["pH",h.ph],["Saturated conductivity",h.saturatedConductivityUmS]].map(([label,m]) => <div key={label as string} className="col-span-2 grid grid-cols-2 gap-3"><dt className="text-muted-foreground">{label as string}</dt><dd className="break-words">{display(m as SoilMeasure)}</dd></div>)}</dl></details>)}
    </div>)}
    {data && <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="text-xs underline">{data.source} · Checked {new Date(data.retrievedAt).toLocaleDateString()}</a>}
  </section>;
}
