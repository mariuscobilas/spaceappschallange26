"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useSidebar } from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { FieldConditions } from "@/components/fields/FieldConditions";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { fromCanonicalEconomicsValue, toCanonicalEconomicsValue, formatArea } from "@/lib/units";
import { contextKey, crops, coverCrops, emptyPlan, validDate, today, type FieldPlan } from "@/lib/workspace";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - days);
  return value.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function PlannerForm() {
  const { settings, activeField, savedPlan, planDraft, updatePlanDraft, storageAvailable, boundaryArea, change } = useMeridian();
  const draft: FieldPlan = planDraft ?? savedPlan ?? emptyPlan;
  const conditionPoint = settings.selection.boundary
    ? analyzeBoundary(settings.selection.boundary)?.sample
    : { latitude: settings.selection.latitude, longitude: settings.selection.longitude };
  const [unitSystem, setUnitSystem] = useUnitSystem();
  const { isMobile, state: sidebarState } = useSidebar();
  const [showConditions, setShowConditions] = useState(false);
  const [terminationText, setTerminationText] = useState(String(draft.terminationDays));
  const polygonArea = boundaryArea === undefined ? undefined : String(boundaryArea);
  const areaHa = polygonArea ?? draft.areaHa;
  const area = areaHa === "" ? null : Number(areaHa);
  const displayedArea = areaHa === "" || unitSystem === "metric" ? areaHa
    : String(Number(fromCanonicalEconomicsValue("areaHa", Number(areaHa), unitSystem, settings.crop).toPrecision(12)));
  const areaInvalid = areaHa !== "" && (!Number.isFinite(area) || area! <= 0 || area! > 5000);
  const dateInvalid = draft.plantingDate !== "" && !validDate(draft.plantingDate, true);
  const dateReady = validDate(draft.plantingDate, true);
  const notesInvalid = draft.notes.length > 4000;
  const parsedTermination = terminationText.trim() === "" ? NaN : Number(terminationText);
  const terminationInputValid = Number.isInteger(parsedTermination) && parsedTermination >= 0 && parsedTermination <= 60 && parsedTermination % 5 === 0;
  const terminationReady = terminationInputValid && parsedTermination === draft.terminationDays;
  const canContinue = !!activeField && dateReady && terminationReady && !areaInvalid && !notesInvalid;
  const terminationDate = useMemo(
    () => dateReady ? addDays(draft.plantingDate, draft.terminationDays) : null,
    [draft.plantingDate, draft.terminationDays, dateReady],
  );
  const update = <K extends keyof FieldPlan>(field: K, value: FieldPlan[K]) => updatePlanDraft({ ...draft, [field]: value });
  const cropLabel = coverCrops.find((crop) => crop.value === draft.coverCrop)?.label ?? draft.coverCrop;

  if (!activeField) {
    return (
      <section aria-label="Calendar" className="mx-auto w-full max-w-3xl p-5 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose a saved field to build its planting calendar.</p>
        <Button className="mt-5" render={<Link href="/planner" />} nativeButton={false}>Choose a field</Button>
      </section>
    );
  }

  const summary = (
    <Card aria-label="Calendar summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Calendar summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Planned cover crop termination</p>
          <p className="mt-1 text-xl font-semibold tracking-tight" aria-live="polite">{terminationDate ?? "Set a planting date"}</p>
        </div>
        <ol aria-label="Two date calendar" className="space-y-3 border-l pl-4 text-sm">
          <li className="relative"><span aria-hidden="true" className="absolute -left-[1.34rem] top-1.5 size-2 rounded-full bg-primary" /><p className="text-muted-foreground">Cover crop termination · {draft.terminationDays} days before</p><p className="font-medium">{terminationDate ?? "Set a planting date"}</p></li>
          <li className="relative"><span aria-hidden="true" className="absolute -left-[1.34rem] top-1.5 size-2 rounded-full border-2 border-primary bg-background" /><p className="text-muted-foreground">Cash crop planting · {cropLabel}</p><p className="font-medium">{dateReady ? addDays(draft.plantingDate, 0) : "Not set"}</p></li>
        </ol>
        {area !== null && !areaInvalid && <p className="text-xs text-muted-foreground">Field area · {formatArea(area, unitSystem)}</p>}
        <p className="text-xs text-muted-foreground">Calculated from your chosen interval; this is not an AI recommendation.</p>
      </CardContent>
      <CardFooter className="hidden flex-col items-stretch gap-2 lg:flex">
        {canContinue ? (
          <Button render={<Link href="/economics" />} nativeButton={false}>Continue to budget</Button>
        ) : (
          <Button disabled>Continue to budget</Button>
        )}
        {canContinue ? (
          <Button variant="ghost" render={<Link href="/planner/review?budget=skip" />} nativeButton={false}>Review calendar only</Button>
        ) : (
          <Button variant="ghost" disabled>Review calendar only</Button>
        )}
      </CardFooter>
    </Card>
  );

  return (
    <section aria-label="Calendar" className="mx-auto w-full max-w-5xl p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="pt-5">
              <FieldGroup className="gap-5">
                <Field data-invalid={dateInvalid || undefined}>
                  <FieldLabel htmlFor="planner-date">Cash crop planting date</FieldLabel>
                  <Input id="planner-date" type="date" value={draft.plantingDate} aria-invalid={dateInvalid || undefined} aria-describedby={dateInvalid ? "planner-date-error" : undefined} onChange={(event) => update("plantingDate", event.target.value)} />
                  {dateInvalid && <FieldDescription id="planner-date-error">Enter a valid calendar date.</FieldDescription>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="planner-cash-crop">Next cash crop</FieldLabel>
                  <NativeSelect id="planner-cash-crop" value={settings.crop} onChange={event => change("crop", event.target.value as typeof settings.crop)}>
                    {crops.map(crop => <NativeSelectOption key={crop.value} value={crop.value}>{crop.label}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="planner-crop">Cover crop</FieldLabel>
                  <NativeSelect id="planner-crop" value={draft.coverCrop} onChange={(event) => update("coverCrop", event.target.value as FieldPlan["coverCrop"])}>
                    {coverCrops.map((crop) => <NativeSelectOption key={crop.value} value={crop.value}>{crop.label}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field data-invalid={!terminationReady || undefined}>
                  <FieldLabel htmlFor="planner-termination">Days before planting</FieldLabel>
                  <div className="flex items-center gap-4">
                    <Input id="planner-termination" type="number" min="0" max="60" step="5" inputMode="numeric" className="w-24" value={terminationText} aria-invalid={!terminationReady || undefined} aria-describedby="planner-termination-help" onChange={(event) => setTerminationText(event.target.value)} onBlur={() => {
                      const value = terminationText.trim() === "" ? draft.terminationDays : Number(terminationText);
                      const normalized = Number.isFinite(value) ? Math.min(60, Math.max(0, Math.round(value / 5) * 5)) : draft.terminationDays;
                      setTerminationText(String(normalized));
                      update("terminationDays", normalized);
                    }} />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                  <Slider min={0} max={60} step={5} value={draft.terminationDays} onValueChange={(value) => { const next = Number(value); setTerminationText(String(next)); update("terminationDays", next); }} aria-label="Days before planting to terminate cover crop" />
                  <FieldDescription id="planner-termination-help">{terminationReady ? "Choose a 0–60 day interval in 5 day steps. The termination date is calculated from your choice." : "Enter a whole number from 0 to 60. It will be rounded to the nearest 5 days when you leave the field."}</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className="lg:hidden">{summary}</div>

          <details className="rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Field area and notes</summary>
            <div className="mt-4 space-y-5">
              <Field data-invalid={areaInvalid || undefined}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="planner-area">Field area ({unitSystem === "us" ? "ac" : "ha"})</FieldLabel>
                  <Button variant="ghost" size="sm" onClick={() => setUnitSystem(unitSystem === "us" ? "metric" : "us")}>{unitSystem === "us" ? "Use hectares" : "Use acres"}</Button>
                </div>
                <Input id="planner-area" type="number" min="0.01" max={fromCanonicalEconomicsValue("areaHa", 5000, unitSystem, settings.crop)} step="any" inputMode="decimal" value={displayedArea} readOnly={polygonArea !== undefined} aria-invalid={areaInvalid || undefined} aria-describedby={areaInvalid ? "planner-area-error" : "planner-area-help"} onChange={(event) => update("areaHa", event.target.value === "" ? "" : unitSystem === "metric" ? event.target.value : String(toCanonicalEconomicsValue("areaHa", Number(event.target.value), unitSystem, settings.crop)))} />
                <FieldDescription id="planner-area-help">{polygonArea !== undefined ? "Calculated from saved field boundary." : "Optional. Enter the managed field area; map cell area is not substituted."}</FieldDescription>
                {area !== null && !areaInvalid && <FieldDescription>{formatArea(area, unitSystem === "us" ? "metric" : "us")}</FieldDescription>}
                {areaInvalid && <FieldDescription id="planner-area-error">Enter an area greater than 0 and no more than 5,000 ha.</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor="planner-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                <Textarea id="planner-notes" maxLength={4000} value={draft.notes} aria-invalid={notesInvalid || undefined} onChange={(event) => update("notes", event.target.value)} placeholder="Optional management notes" />
                <FieldDescription>{draft.notes.length}/4,000 characters.</FieldDescription>
              </Field>
            </div>
          </details>
          <details className="rounded-lg border px-4 py-3" onToggle={(event) => setShowConditions(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium">Conditions and sources</summary>
            <p className="mt-2 text-xs text-muted-foreground">Point or grid context; readings do not assess field wide suitability.</p>
            {showConditions && <div className="mt-3"><FieldConditions point={conditionPoint} asOf={settings.timeMode === "past" ? settings.observationDate : today()} /></div>}
          </details>
          <p role="status" className="text-xs text-muted-foreground">{storageAvailable ? (planDraft ? "Draft saved on this device." : savedPlan ? "Saved calendar. Changes are kept as a draft." : "Your changes are saved automatically on this device.") : "Draft kept for this session; device storage is unavailable."}</p>
        </div>
        <aside className="hidden lg:sticky lg:top-5 lg:block" aria-label="Calendar summary">{summary}</aside>
      </div>
      <div style={{ left: isMobile ? 0 : sidebarState === "collapsed" ? "3rem" : "var(--sidebar-width)" }} className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl gap-2">
          {canContinue ? <Button className="min-w-0 flex-1" render={<Link href="/economics" />} nativeButton={false}>Continue to budget</Button> : <Button className="min-w-0 flex-1" disabled>Continue to budget</Button>}
          {canContinue ? <Button className="min-w-0 flex-1" variant="outline" render={<Link href="/planner/review?budget=skip" />} nativeButton={false}>Review calendar only</Button> : <Button className="min-w-0 flex-1" variant="outline" disabled>Review calendar only</Button>}
        </div>
      </div>
    </section>
  );
}

export default function PlannerWorkspace() {
  const { ready, settings } = useMeridian();
  if (!ready) return <section aria-label="Calendar" className="mx-auto w-full max-w-5xl p-6" aria-busy="true">Loading calendar…</section>;
  return <PlannerForm key={contextKey(settings)} />;
}
