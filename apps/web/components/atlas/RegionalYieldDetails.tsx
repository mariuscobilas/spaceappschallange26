"use client";

import { useAtlasState } from "./AtlasContext";

const signedPercent = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;

export function RegionalYieldDetails() {
  const s = useAtlasState();
  if (!s) return null;
  const data = s.regional;
  const region = data?.regions.find((item) => item.fips === s.selectedFips);
  const estimate = region?.estimates.find((item) => item.crop === s.countyCrop && item.period === s.countyPeriod);

  return (
    <section className="flex flex-col gap-4 text-sm" aria-label="Published county estimate details">
      {region ? (
        <>
          {estimate ? (
            <>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">Estimated yield difference</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{signedPercent(estimate.meanYieldEffectPct)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.countyCrop === "corn" ? "Corn" : "Soybeans"} · {s.countyPeriod}</p>
              </div>
              <p className="leading-relaxed text-muted-foreground">A county aggregate of published sample-level model estimates. It is not a county-wide measured yield, current field forecast, or farm prediction.</p>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Study records</dt><dd className="text-right tabular-nums">{estimate.sampleRecords}</dd>
                <dt className="text-muted-foreground">2019 records</dt><dd className="text-right tabular-nums">{estimate.sampleRecordsByYear["2019"]}</dd>
                <dt className="text-muted-foreground">2020 records</dt><dd className="text-right tabular-nums">{estimate.sampleRecordsByYear["2020"]}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">Counts are study records, not independent farms or a confidence score.</p>
            </>
          ) : (
            <p role="status" className="rounded-md border p-3 text-muted-foreground">No estimate for this crop/period. Missing estimates are not zero.</p>
          )}
        </>
      ) : s.regionalLoading ? (
        <p role="status" className="text-muted-foreground">Loading historical county estimates…</p>
      ) : data?.status === "unavailable" ? (
        <p role="status" className="text-muted-foreground">{data.message}</p>
      ) : s.selectedFips ? (
        <p role="status" className="text-muted-foreground">This county is not included in the loaded study data.</p>
      ) : (
        <p className="text-muted-foreground">Choose a county on the map or from the County list to inspect its published estimate.</p>
      )}

      {data?.status === "available" && (
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">Source, method and limitations</summary>
          <div className="space-y-2 pb-2 leading-relaxed">
            {region && <p>County FIPS {region.fips} · representative point {region.centroid[1].toFixed(4)}, {region.centroid[0].toFixed(4)}</p>}
            {data.method ? <>
              <p>{data.method.summary} {data.method.interpretation}</p>
              <p>Minimum {data.method.minimumSampleRecords} {data.method.sampleUnit}s per estimate. The period totals may pool one or both study years; annual counts above show the available records. Counts do not express precision or confidence.</p>
              {data.method.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
            </> : <p>Method information is unavailable for this response.</p>}
            {data.source && <p><a className="underline underline-offset-2" href={data.source.url} target="_blank" rel="noreferrer">{data.source.title}</a></p>}
            {data.source && <p className="break-all">DOI {data.source.doi} · archive SHA-256 {data.source.archiveSha256}</p>}
            {s.regionalFallback && <p>This is the bundled study copy because the service could not be reached.</p>}
          </div>
        </details>
      )}
    </section>
  );
}
