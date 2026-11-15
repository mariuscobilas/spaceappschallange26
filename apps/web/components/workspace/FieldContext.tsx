"use client";

import { useEffect, useId, useRef } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { crops, locationLabel } from "@/lib/workspace";
import type { PreviewCrop } from "@/lib/map/types";

/** The same field and intended cash crop travel through every workspace. */
export function FieldContext({ compact = false, includeSavedFields = true, includeCrop = true }: { compact?: boolean; includeSavedFields?: boolean; includeCrop?: boolean }) {
  const id = useId();
  const { ready, settings, fields, activeField, fieldDraft, chooseField,
    requestTransition, cancelField, selectLocation, change, updateFieldDraft } = useMeridian();
  const pendingBrowseCrop = useRef<PreviewCrop | null>(null);
  useEffect(() => {
    if (!includeSavedFields && !settings.selection.fieldId && pendingBrowseCrop.current) {
      const crop = pendingBrowseCrop.current;
      pendingBrowseCrop.current = null;
      change("crop", crop);
    }
  }, [change, includeSavedFields, settings.selection.fieldId]);
  const value = includeSavedFields && activeField ? `field:${activeField.id}`
    : "selection";
  return (
    <FieldGroup className={compact ? "!w-full !flex-row !flex-nowrap items-center !gap-2 [container-type:normal]" : "!w-auto !flex-row !flex-wrap items-center !gap-2 [container-type:normal]"} aria-label="Field context" data-compact={compact || undefined}>
      <Field className={compact ? "min-w-0 flex-1" : "w-48 min-w-0"}>
        <FieldLabel htmlFor={`${id}-location`} className="text-xs text-muted-foreground">Field or location</FieldLabel>
        <NativeSelect id={`${id}-location`} className="w-full" value={value} disabled={!ready}
          onChange={(event) => {
            const next = event.target.value;
            if (next.startsWith("field:")) chooseField(next.slice(6));
          }}>
          {value === "selection" && <NativeSelectOption value="selection">{includeSavedFields ? fieldDraft?.name ?? locationLabel(settings.selection) : locationLabel(settings.selection)}</NativeSelectOption>}
          {includeSavedFields && fields.length > 0 && <NativeSelectOptGroup label="Your saved fields">
            {fields.map((f) => <NativeSelectOption key={f.id} value={`field:${f.id}`}>{f.name}</NativeSelectOption>)}
          </NativeSelectOptGroup>}
        </NativeSelect>
      </Field>
      {includeCrop && <Field className={compact ? "w-28 shrink-0 crop-control" : "w-28 crop-control"}>
        <FieldLabel htmlFor={`${id}-crop`} className="text-xs text-muted-foreground">Next crop</FieldLabel>
        <NativeSelect id={`${id}-crop`} aria-label="Cash crop" className="w-full" disabled={!ready} title="Intended next cash crop"
          value={includeSavedFields ? fieldDraft?.currentCrop ?? settings.crop : settings.crop}
          onChange={(event) => {
            const crop = event.target.value as PreviewCrop;
            if (!includeSavedFields) requestTransition(() => {
              if (fieldDraft) cancelField();
              if (settings.selection.fieldId) {
                pendingBrowseCrop.current = crop;
                selectLocation({ ...settings.selection, fieldId: undefined });
              } else change("crop", crop);
            });
            else if (fieldDraft) updateFieldDraft({ currentCrop: crop, cropSource: "manual" });
            else change("crop", crop);
          }}>
          {crops.map((crop) => <NativeSelectOption value={crop.value} key={crop.value}>{crop.label}</NativeSelectOption>)}
        </NativeSelect>
      </Field>}
    </FieldGroup>
  );
}
