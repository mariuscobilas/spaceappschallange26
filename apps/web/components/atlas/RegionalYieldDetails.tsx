"use client";
import { useAtlasState } from "./AtlasContext";

export function RegionalYieldDetails(){
 const s=useAtlasState();if(!s)return null;
 const data=s.regional;const region=data?.regions.find(r=>r.fips===s.selectedFips);
 const estimate=region?.estimates.find(e=>e.crop===s.countyCrop&&e.period===s.countyPeriod);
 return <section className="flex flex-col gap-4 text-sm" aria-label="Published county estimate details">
  {region?<><div><h2 className="text-base font-semibold">{region.name}, {region.state}</h2><p className="text-muted-foreground">County FIPS {region.fips} · representative point {region.centroid[1].toFixed(4)}, {region.centroid[0].toFixed(4)}</p></div>
   {estimate?<dl className="grid grid-cols-2 gap-x-3 gap-y-2"><dt className="text-muted-foreground">Crop and period</dt><dd>{s.countyCrop} · {s.countyPeriod}</dd><dt className="text-muted-foreground">Mean yield effect</dt><dd className="font-medium tabular-nums">{estimate.meanYieldEffectPct.toFixed(2)}%</dd><dt className="text-muted-foreground">Sample records</dt><dd>{estimate.sampleRecords}</dd><dt className="text-muted-foreground">2019 records</dt><dd>{estimate.sampleRecordsByYear["2019"]}</dd><dt className="text-muted-foreground">2020 records</dt><dd>{estimate.sampleRecordsByYear["2020"]}</dd></dl>:<p>No published {s.countyCrop} estimate for {s.countyPeriod}. Missing estimates are not zero.</p>}
  </>:<p className="text-muted-foreground">Choose a county on the map to inspect its published estimate.</p>}
  <p className="text-xs text-muted-foreground">Historical county mean of published model sample records. This is not a current field forecast, county wide crop average, or farm recommendation. The county representative point is a geographic reference, not a field sample.</p>
  {data?.source&&<div className="flex flex-col gap-1 text-xs"><a className="underline" href={data.source.url} target="_blank" rel="noreferrer">{data.source.title}</a><span className="break-all">DOI {data.source.doi} · archive SHA-256 {data.source.archiveSha256}</span></div>}
 </section>;
}
