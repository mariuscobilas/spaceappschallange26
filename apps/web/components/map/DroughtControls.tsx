"use client";
import { DROUGHT_CLASSES, DROUGHT_DATASET, type DroughtStatus } from "@/lib/map/drought";
import { Button } from "@/components/ui/button";

export function DroughtControls({ enabled, status, onChange, retry }: { enabled: boolean; status: DroughtStatus; onChange: (enabled: boolean) => void; retry: () => void }) {
  return <section aria-label="Drought dataset" className="my-5 space-y-3">
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-primary" checked={enabled} onChange={e => onChange(e.target.checked)} />U.S. Drought Monitor</label>
    <p className="text-xs leading-relaxed text-muted-foreground">Regional snapshot · {DROUGHT_DATASET.asOf}. Independent of NASA observation dates.</p>
    {enabled && <>
      <p role="status" className="text-xs">{status === "ready" ? "Drought overlay displayed" : status === "unavailable" ? "Drought overlay unavailable. Other map layers remain usable." : "Loading drought overlay…"}</p>
      {status === "unavailable" && <Button variant="outline" size="sm" onClick={retry}>Retry drought overlay</Button>}
      <ul aria-label="Drought legend" className="space-y-1 text-xs">{DROUGHT_CLASSES.map(c => <li key={c.value} className="flex items-center gap-2"><span className="size-3 shrink-0 border border-foreground/40" style={{ background: c.color }} />{c.label}</li>)}</ul>
      <details className="text-xs text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">Coverage and interpretation</summary><p className="pt-2 leading-relaxed">Simplified U.S. regional boundaries for display. Unshaded areas are outside the displayed D0–D4 polygons. This snapshot does not establish conditions elsewhere or provide field-level moisture, yield or return estimates.</p></details>
    </>}
    <p className="text-xs text-muted-foreground">NDMC, USDA, NOAA and NASA. Data courtesy of <a className="underline" href="https://droughtmonitor.unl.edu/DmData/GISData.aspx" target="_blank" rel="noreferrer">NDMC · source and downloads</a>.</p>
  </section>;
}
