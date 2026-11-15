"use client";

import { useAtlasState } from "./AtlasContext";

export function ResearchMapFooter() {
  const s = useAtlasState();
  if (!s) return null;
  const crop = s.countyCrop === "corn" ? "Corn" : "Soybeans";
  const period = s.countyPeriod === "2019-2020" ? "2019–2020" : s.countyPeriod;
  const dataStatus = s.regionalLoading
    ? "Loading estimates"
    : s.regional?.status === "unavailable"
      ? "Data unavailable · retry in Map options"
      : s.regionalFallback
        ? "Bundled study copy"
        : s.regional?.status === "available"
          ? "Published county study"
          : "Study data not loaded";

  return (
    <footer aria-label="Historical research map legend" className="max-h-20 w-full shrink-0 overflow-y-auto border-t bg-background px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 leading-4">
        <span className="font-medium text-foreground">Historical research · {crop} · {period}</span>
        <span role="status" aria-live="polite">{dataStatus}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 leading-4" aria-label="Estimated yield difference legend">
        <span className="flex items-center gap-1"><i className="size-3 rounded-sm bg-[#8c7aa8]" aria-hidden="true" />Lower ≤ −10%</span>
        <span className="flex items-center gap-1"><i className="size-3 rounded-sm border bg-[#f4f1eb]" aria-hidden="true" />0%</span>
        <span className="flex items-center gap-1"><i className="size-3 rounded-sm bg-[#23877d]" aria-hidden="true" />Higher ≥ +10%</span>
        <span className="flex items-center gap-1"><i className="size-3 rounded-sm bg-[#9aa09a]" aria-hidden="true" />No estimate</span>
      </div>
    </footer>
  );
}
