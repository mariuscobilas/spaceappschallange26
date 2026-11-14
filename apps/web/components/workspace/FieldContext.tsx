"use client";

import { useId } from "react";
import farms from "@/data/benchmark_farms.json";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { crops, locationLabel } from "@/lib/workspace";
import type { PreviewCrop } from "@/lib/map/types";

/** The same field and intended cash crop travel through every workspace. */
export function FieldContext() {
  const id = useId();
  const { ready, settings, fields, activeField, fieldDraft, chooseField,
    requestTransition, cancelField, selectLocation, change, updateFieldDraft } = useMeridian();
  const value = activeField ? `field:${activeField.id}`
    : settings.selection.benchmarkId ? `benchmark:${settings.selection.benchmarkId}` : "selection";
  return (
    <FieldGroup className="!w-auto !flex-row !flex-wrap items-center !gap-2 [container-type:normal]" aria-label="Field context">
      <Field className="w-48 min-w-0">
        <FieldLabel htmlFor={`${id}-location`} className="text-xs text-muted-foreground">Field or location</FieldLabel>
        <NativeSelect id={`${id}-location`} className="w-full" value={value} disabled={!ready}
          onChange={(event) => {
            const next = event.target.value;
            if (next.startsWith("field:")) chooseField(next.slice(6));
            else if (next.startsWith("benchmark:")) requestTransition(() => {
              const farm = farms.find((f) => f.id === next.slice(10));
              if (!farm) return;
              if (fieldDraft) cancelField();
              selectLocation({ name: farm.name, latitude: farm.latitude,
                longitude: farm.longitude, benchmarkId: farm.id }, true);
            });
          }}>
          {value === "selection" && <NativeSelectOption value="selection">{fieldDraft?.name ?? locationLabel(settings.selection)}</NativeSelectOption>}
          {fields.length > 0 && <NativeSelectOptGroup label="Your saved fields">
            {fields.map((f) => <NativeSelectOption key={f.id} value={`field:${f.id}`}>{f.name}</NativeSelectOption>)}
          </NativeSelectOptGroup>}
          <NativeSelectOptGroup label="Kansas reference locations">
            {farms.map((f) => <NativeSelectOption key={f.id} value={`benchmark:${f.id}`}>{f.name}, Kansas</NativeSelectOption>)}
          </NativeSelectOptGroup>
        </NativeSelect>
      </Field>
      <Field className="w-28 crop-control">
        <FieldLabel htmlFor={`${id}-crop`} className="text-xs text-muted-foreground">Next crop</FieldLabel>
        <NativeSelect id={`${id}-crop`} aria-label="Cash crop" className="w-full" disabled={!ready} title="Intended next cash crop"
          value={fieldDraft?.currentCrop ?? settings.crop}
          onChange={(event) => {
            const crop = event.target.value as PreviewCrop;
            if (fieldDraft) updateFieldDraft({ currentCrop: crop, cropSource: "manual" });
            else change("crop", crop);
          }}>
          {crops.map((crop) => <NativeSelectOption value={crop.value} key={crop.value}>{crop.label}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
    </FieldGroup>
  );
}
