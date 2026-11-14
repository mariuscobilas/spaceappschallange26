"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { FieldConditions } from "@/components/fields/FieldConditions";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { fromCanonicalEconomicsValue, toCanonicalEconomicsValue, formatArea } from "@/lib/units";
import {
  contextKey,
  coverCrops,
  emptyPlan,
  locationLabel,
  validDate,
  today,
  type FieldPlan,
} from "@/lib/workspace";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - days);
  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function PlannerForm() {
  const { settings, savedPlan, planDraft, updatePlanDraft, savePlan, storageAvailable, boundaryArea } =
    useMeridian();
  const draft: FieldPlan = planDraft ?? savedPlan ?? emptyPlan;
  const conditionPoint = settings.selection.boundary
    ? analyzeBoundary(settings.selection.boundary)?.sample
    : { latitude: settings.selection.latitude, longitude: settings.selection.longitude };
  const [unitSystem, setUnitSystem] = useUnitSystem();
  const [saved, setSaved] = useState(false);
  const polygonArea =
    boundaryArea === undefined ? undefined : String(boundaryArea);
  const areaHa = polygonArea ?? draft.areaHa;
  const area = areaHa === "" ? null : Number(areaHa);
  const displayedArea = areaHa === "" || unitSystem === "metric" ? areaHa
    : String(Number(fromCanonicalEconomicsValue("areaHa", Number(areaHa), unitSystem, settings.crop).toPrecision(12)));
  const areaInvalid =
    areaHa !== "" &&
    (!Number.isFinite(area) || area! <= 0 || area! > 5000);
  const dateInvalid =
    draft.plantingDate !== "" && !validDate(draft.plantingDate, true);
  const notesInvalid = draft.notes.length > 4000;
  const canSave = !areaInvalid && !dateInvalid && !notesInvalid;
  const missingInputs = [
    ...(!draft.plantingDate ? ["cash crop planting date"] : []),
    ...(!areaHa ? ["managed field area"] : []),
  ];
  const terminationDate = useMemo(
    () =>
      draft.plantingDate && validDate(draft.plantingDate, true)
        ? addDays(draft.plantingDate, draft.terminationDays)
        : null,
    [draft.plantingDate, draft.terminationDays],
  );
  const update = <K extends keyof FieldPlan>(field: K, value: FieldPlan[K]) => {
    updatePlanDraft({ ...draft, [field]: value });
    setSaved(false);
  };
  const onSave = () => {
    if (!canSave) return;
    setSaved(savePlan({ ...draft, areaHa }));
  };

  return (
    <section
      aria-label="Field Planner workspace"
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6"
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Your next planting
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Plan termination
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Set the next cash crop planting date, then work backwards to a
          termination date for your existing cover crop.
        </p>
        <Button className="self-start" variant="outline" render={<Link href="/planner/saved" />} nativeButton={false}>
          Saved plans
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="lg:col-span-2 flex flex-col gap-3">
        <Alert>
          <AlertTitle>{missingInputs.length ? "Planning inputs still needed" : "Planning inputs entered"}</AlertTitle>
          <AlertDescription>
            {missingInputs.length ? `Add ${missingInputs.join(" and ")} for a complete calendar plan. ` : "The selected date and managed area are available for this plan. "}
            Moisture suitability, yield impact, and recommended termination timing are not analyzed; the calendar date uses your chosen interval only.
          </AlertDescription>
        </Alert>
        {savedPlan && planDraft && <p className="text-sm text-muted-foreground">This workspace is showing a working draft. The saved plan remains unchanged until you save this draft.</p>}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Field plan</CardTitle>
          <CardDescription>
            {locationLabel(settings.selection)} ·{" "}
            {settings.crop[0].toUpperCase() + settings.crop.slice(1)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-6">
              <Field data-invalid={dateInvalid || undefined}>
                <FieldLabel htmlFor="planner-date">
                  Cash crop planting date
                </FieldLabel>
                <Input
                  id="planner-date"
                  type="date"
                  value={draft.plantingDate}
                  aria-invalid={dateInvalid || undefined}
                  aria-describedby={
                    dateInvalid
                      ? "planner-date-help planner-date-error"
                      : "planner-date-help"
                  }
                  onChange={(event) =>
                    update("plantingDate", event.target.value)
                  }
                />
                <FieldDescription id="planner-date-help">
                  {terminationDate
                    ? `Calculated cover crop termination date: ${terminationDate}.`
                    : "Optional. Enter a date to calculate a calendar termination date."}
                </FieldDescription>
                {dateInvalid && (
                  <FieldDescription id="planner-date-error">
                    Enter a valid calendar date.
                  </FieldDescription>
                )}
              </Field>

            <Field>
              <FieldLabel htmlFor="planner-crop">Cover crop</FieldLabel>
              <NativeSelect
                id="planner-crop"
                value={draft.coverCrop}
                onChange={(event) =>
                  update(
                    "coverCrop",
                    event.target.value as FieldPlan["coverCrop"],
                  )
                }
              >
                {coverCrops.map((crop) => (
                  <NativeSelectOption key={crop.value} value={crop.value}>
                    {crop.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                The cover crop currently growing, or the mix you are managing.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="planner-termination">
                Termination timing · {draft.terminationDays} days before
                planting
              </FieldLabel>
              <Slider
                id="planner-termination"
                min={0}
                max={60}
                step={5}
                value={draft.terminationDays}
                onValueChange={(value) =>
                  update("terminationDays", Number(value))
                }
                aria-label="Days before planting to terminate cover crop"
              />
              <FieldDescription>
                Your planned lead time, from 0 to 60 days. This is not a model-selected interval.
              </FieldDescription>
            </Field>

            <div>
              <Field data-invalid={areaInvalid || undefined}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="planner-area">Field area ({unitSystem === "us" ? "ac" : "ha"})</FieldLabel>
                  <Button variant="ghost" size="sm" onClick={() => setUnitSystem(unitSystem === "us" ? "metric" : "us")}>
                    {unitSystem === "us" ? "Use hectares" : "Use acres"}
                  </Button>
                </div>
                <Input
                  id="planner-area"
                  type="number"
                  min="0.01"
                  max={fromCanonicalEconomicsValue("areaHa", 5000, unitSystem, settings.crop)}
                  step="any"
                  inputMode="decimal"
                  value={displayedArea}
                  readOnly={polygonArea !== undefined}
                  aria-invalid={areaInvalid || undefined}
                  aria-describedby={
                    areaInvalid
                      ? "planner-area-help planner-area-error"
                      : "planner-area-help"
                  }
                  onChange={(event) => update("areaHa", event.target.value === "" ? "" : unitSystem === "metric" ? event.target.value : String(toCanonicalEconomicsValue("areaHa", Number(event.target.value), unitSystem, settings.crop)))}
                />
                <FieldDescription id="planner-area-help">
                  {polygonArea !== undefined
                    ? "Calculated from saved field boundary."
                    : "Optional, up to 5,000 ha. Enter the managed field area; map cell area is not substituted."}
                </FieldDescription>
                {area !== null && !areaInvalid && <FieldDescription>
                  {formatArea(area, unitSystem === "us" ? "metric" : "us")}
                </FieldDescription>}
                {areaInvalid && (
                  <FieldDescription id="planner-area-error">
                    Enter an area greater than 0 and no more than 5,000 ha.
                  </FieldDescription>
                )}
              </Field>
            </div>

            <Field data-invalid={notesInvalid || undefined}>
              <FieldLabel htmlFor="planner-notes">Notes</FieldLabel>
              <Textarea
                id="planner-notes"
                maxLength={4000}
                value={draft.notes}
                aria-invalid={notesInvalid || undefined}
                aria-describedby="planner-notes-help"
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Optional management notes"
              />
              <FieldDescription id="planner-notes-help">
                {draft.notes.length}/4,000 characters.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={onSave} disabled={!canSave}>
            Save field plan
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {saved
              ? "Saved on this device."
              : savedPlan
                ? "A saved plan exists for this location and crop."
                : "No saved plan for this location and crop."}
          </p>
        </CardFooter>
      </Card>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Termination calendar">
        <Card>
          <CardHeader>
            <CardTitle>Your termination plan</CardTitle>
            <CardDescription>{locationLabel(settings.selection)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="text-sm text-muted-foreground">Planned termination</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight" aria-live="polite">
                {terminationDate ?? "Set a planting date"}
              </p>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Cover crop</dt>
              <dd>{coverCrops.find((crop) => crop.value === draft.coverCrop)?.label}</dd>
              <dt className="text-muted-foreground">Before planting</dt>
              <dd>{draft.terminationDays} days</dd>
              <dt className="text-muted-foreground">Cash crop planting</dt>
              <dd>{draft.plantingDate && !dateInvalid ? addDays(draft.plantingDate, 0) : "Not set"}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              This date follows your chosen interval. Moisture, yield and recommended timing are not assessed yet.
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline" render={<Link href="/economics" />} nativeButton={false}>
              Review costs and break-even
            </Button>
          </CardFooter>
        </Card>
        <p className="text-sm text-muted-foreground" role="status">
          {planDraft ? (storageAvailable ? "Working draft kept on this device as you edit." : "Working draft kept for this session.") : "Your working draft follows this field and crop across workspaces."}
        </p>
        <FieldConditions point={conditionPoint} asOf={settings.timeMode === "past" ? settings.observationDate : today()} />
      </aside>
      </div>

      {!storageAvailable && (
        <Alert variant="destructive">
          <AlertTitle>Local storage unavailable</AlertTitle>
          <AlertDescription>
            This plan remains available for this session but could not be
            confirmed as saved on this device.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

export default function PlannerWorkspace() {
  const { ready, settings } = useMeridian();
  if (!ready)
    return (
      <section
        aria-label="Field Planner workspace"
        className="mx-auto w-full max-w-[1100px] p-6"
        aria-busy="true"
      >
        Loading field plan…
      </section>
    );
  return <PlannerForm key={contextKey(settings)} />;
}
