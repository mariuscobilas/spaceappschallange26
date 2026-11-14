"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  contextKey,
  coverCrops,
  emptyPlan,
  locationLabel,
  validDate,
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
  const { settings, savedPlan, savePlan, storageAvailable, boundaryArea } =
    useMeridian();
  const [draft, setDraft] = useState<FieldPlan>(() =>
    savedPlan
      ? {
          coverCrop: savedPlan.coverCrop,
          terminationDays: savedPlan.terminationDays,
          plantingDate: savedPlan.plantingDate,
          areaHa: savedPlan.areaHa,
          notes: savedPlan.notes,
        }
      : { ...emptyPlan },
  );
  const [saved, setSaved] = useState(false);
  const polygonArea =
    boundaryArea === undefined ? undefined : String(boundaryArea);
  useEffect(() => {
    if (polygonArea !== undefined) {
      setDraft((current) => ({ ...current, areaHa: polygonArea }));
    }
  }, [polygonArea]);
  const areaHa = polygonArea ?? draft.areaHa;
  const area = areaHa === "" ? null : Number(areaHa);
  const areaInvalid =
    areaHa !== "" &&
    (!Number.isFinite(area) || area! <= 0 || area! > 5000);
  const dateInvalid =
    draft.plantingDate !== "" && !validDate(draft.plantingDate, true);
  const notesInvalid = draft.notes.length > 4000;
  const canSave = !areaInvalid && !dateInvalid && !notesInvalid;
  const terminationDate = useMemo(
    () =>
      draft.plantingDate && validDate(draft.plantingDate, true)
        ? addDays(draft.plantingDate, draft.terminationDays)
        : null,
    [draft.plantingDate, draft.terminationDays],
  );
  const update = <K extends keyof FieldPlan>(field: K, value: FieldPlan[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
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
          Field management
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Plan a cover crop
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Record your intended cover crop, termination timing, and field
          assumptions for the selected area.
        </p>
      </header>

      <Alert>
        <AlertTitle>Planning inputs only</AlertTitle>
        <AlertDescription>
          Predictions unavailable — model not connected. This plan stores your
          assumptions and does not generate a recommendation.
        </AlertDescription>
      </Alert>

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
                Choose the cover crop you intend to plant.
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
                Set a planning interval from 0 to 60 days.
              </FieldDescription>
            </Field>

            <div className="grid gap-6 md:grid-cols-2">
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
              <Field data-invalid={areaInvalid || undefined}>
                <FieldLabel htmlFor="planner-area">Field area (ha)</FieldLabel>
                <Input
                  id="planner-area"
                  type="number"
                  min="0.01"
                  max="5000"
                  step="any"
                  inputMode="decimal"
                  value={areaHa}
                  readOnly={polygonArea !== undefined}
                  aria-invalid={areaInvalid || undefined}
                  aria-describedby={
                    areaInvalid
                      ? "planner-area-help planner-area-error"
                      : "planner-area-help"
                  }
                  onChange={(event) => update("areaHa", event.target.value)}
                />
                <FieldDescription id="planner-area-help">
                  {polygonArea !== undefined
                    ? "Calculated from saved field boundary."
                    : "Optional, up to 5,000 ha. Enter the managed field area; map cell area is not substituted."}
                </FieldDescription>
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

      {!storageAvailable && (
        <Alert variant="destructive">
          <AlertTitle>Local storage unavailable</AlertTitle>
          <AlertDescription>
            This plan remains available for this session but could not be
            confirmed as saved on this device.
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Need to change the selected area or main crop?{" "}
        <Link className="underline underline-offset-4" href="/">
          Open the map workspace
        </Link>
        . For user-entered cost assumptions, continue to{" "}
        <Link className="underline underline-offset-4" href="/economics">
          economics
        </Link>
        .
      </p>
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
