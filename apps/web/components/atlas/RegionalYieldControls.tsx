"use client";

import { useAtlasState } from "./AtlasContext";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const periods = [
  { value: "2019-2020", label: "2019–2020" },
  { value: "2019", label: "2019" },
  { value: "2020", label: "2020" },
] as const;

export function RegionalYieldControls({ onInspect }: { onInspect?: () => void } = {}) {
  const s = useAtlasState();
  if (!s) return null;
  const data = s.regional?.status === "available" ? s.regional : undefined;
  const selectedCounty = data?.regions.find((region) => region.fips === s.selectedFips);

  return (
    <section aria-label="Historical research controls" className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="research-crop">Research crop</FieldLabel>
          <NativeSelect id="research-crop" value={s.countyCrop} onChange={(event) => s.setCountyCrop(event.target.value as "corn" | "soybeans")}>
            <NativeSelectOption value="corn">Corn</NativeSelectOption>
            <NativeSelectOption value="soybeans">Soybeans</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="research-period">Study period</FieldLabel>
          <NativeSelect id="research-period" value={s.countyPeriod} onChange={(event) => s.setCountyPeriod(event.target.value as "2019-2020" | "2019" | "2020")}>
            {periods.map((period) => <NativeSelectOption key={period.value} value={period.value}>{period.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="research-county">County</FieldLabel>
          <NativeSelect id="research-county" value={s.selectedFips ?? ""} disabled={!data} onChange={(event) => s.setSelectedFips(event.target.value || undefined)}>
            <NativeSelectOption value="">Choose a county</NativeSelectOption>
            {data?.regions.map((region) => <NativeSelectOption key={region.fips} value={region.fips}>{region.name}, {region.state}</NativeSelectOption>)}
          </NativeSelect>
          {!data && <p className="text-xs text-muted-foreground">County selection is available when the study data loads.</p>}
        </Field>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Historical model sample estimates for corn and soybeans in Iowa, Illinois, Indiana, Michigan, Missouri, and Ohio. This county research does not cover Kansas wheat and is not a field forecast.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={!data} onClick={s.fitCounties}>Reset study view</Button>
        {selectedCounty && onInspect && <Button type="button" className="min-h-11" onClick={onInspect}>Inspect selected county</Button>}
        {s.regional?.status === "unavailable" && <Button type="button" variant="outline" className="min-h-11" onClick={s.retryRegional}>Retry study data</Button>}
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">Study source and method</summary>
        <div className="space-y-2 pb-2 leading-relaxed">
          <p>{s.regional?.method?.summary ?? "Published model estimates are summarized as historical county means."} {s.regional?.method?.interpretation ?? "These study records do not establish a current field forecast or recommendation."}</p>
          <p>Coverage: six Corn Belt states. Study records are model sample records, not independent farms or a confidence score. The pooled period can contain records from one year only; county details show annual counts. Study years are separate from NASA observation dates.</p>
          {s.regional?.method?.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
          {s.regional?.source && <p>Source: <a className="underline underline-offset-2" href={s.regional.source.url} target="_blank" rel="noreferrer">{s.regional.source.title}</a> · DOI {s.regional.source.doi} · archive SHA-256 {s.regional.source.archiveSha256}</p>}
          {s.regionalFallback && <p>This is the bundled published study copy because the service could not be reached.</p>}
        </div>
      </details>
    </section>
  );
}
