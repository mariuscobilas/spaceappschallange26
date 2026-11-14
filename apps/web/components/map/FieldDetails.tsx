"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { useLandCover } from "@/lib/fields/use-land-cover";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { validSavedField } from "@/lib/fields/storage";
import { crops, locationLabel } from "@/lib/workspace";
import type { PreviewCrop } from "@/lib/map/types";

export function FieldDetails({
  open,
  onOpenChange,
  onEditBoundary,
  onAtlas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEditBoundary: () => void;
  onAtlas: () => void;
}) {
  const {
    settings,
    status,
    activeField,
    fieldDraft,
    drawing,
    beginField,
    updateFieldDraft,
    saveField,
    cancelField,
    deleteField,
    storageAvailable,
  } = useMeridian();
  const [deleting, setDeleting] = useState(false);
  const field = fieldDraft ?? activeField;
  const info = field?.boundary ? analyzeBoundary(field.boundary) : null;
  const point = info?.sample ??
    field?.location ?? {
      latitude: settings.selection.latitude,
      longitude: settings.selection.longitude,
    };
  const year =
    settings.timeMode === "past"
      ? Number(settings.observationDate.slice(0, 4))
      : new Date().getUTCFullYear();
  const lookup = useLandCover(
    point,
    year,
    open && settings.mode === "field" && !info?.error,
  );
  const result = lookup.result;
  const invalid = fieldDraft
    ? !validSavedField(fieldDraft) || drawing.mode === "polygon"
    : false;
  const acceptedCrop =
    result?.suggestedCrop && crops.some((c) => c.value === result.suggestedCrop)
      ? (result.suggestedCrop as PreviewCrop)
      : undefined;
  const name = field?.name ?? locationLabel(settings.selection);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{fieldDraft ? "Field details" : name}</SheetTitle>
            <SheetDescription>
              {settings.mode === "atlas"
                ? "Regional map selection"
                : "Save a point or field boundary and its crop context."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            {fieldDraft ? (
              <FieldGroup>
                <Field data-invalid={!fieldDraft.name.trim() || undefined}>
                  <FieldLabel htmlFor="field-name">Field name</FieldLabel>
                  <Input
                    id="field-name"
                    value={fieldDraft.name}
                    maxLength={100}
                    aria-invalid={!fieldDraft.name.trim()}
                    onChange={(e) => updateFieldDraft({ name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="field-crop">Cash crop</FieldLabel>
                  <NativeSelect
                    id="field-crop"
                    className="w-full"
                    value={fieldDraft.currentCrop}
                    onChange={(e) =>
                      updateFieldDraft({
                        currentCrop: e.target.value as PreviewCrop,
                        cropSource: "manual",
                      })
                    }
                  >
                    {crops.map((c) => (
                      <NativeSelectOption key={c.value} value={c.value}>
                        {c.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    Choose the crop you intend to manage here.
                  </FieldDescription>
                </Field>
                {!fieldDraft.boundary && (
                  <Field>
                    <FieldLabel htmlFor="point-area">
                      Field area (ha)
                    </FieldLabel>
                    <Input
                      id="point-area"
                      type="number"
                      min="0"
                      max="5000"
                      step="any"
                      value={fieldDraft.areaHectares ?? ""}
                      onChange={(e) =>
                        updateFieldDraft({
                          areaHectares:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                    <FieldDescription>
                      Optional for a point selection. Up to 5,000 ha.
                    </FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>Name</dt>
                  <dd>{name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Cash crop</dt>
                  <dd>{crops.find((c) => c.value === settings.crop)?.label}</dd>
                </div>
              </dl>
            )}
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">
                  {field?.boundary ? "Centroid" : "Selected point"}
                </dt>
                <dd>
                  {(info?.centroid.latitude ?? point.latitude).toFixed(5)},{" "}
                  {(info?.centroid.longitude ?? point.longitude).toFixed(5)}
                </dd>
              </div>
              {field?.boundary && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Geodesic field area</dt>
                  <dd>
                    {info
                      ? `${info.areaHectares.toFixed(3)} ha`
                      : "Invalid boundary"}
                  </dd>
                </div>
              )}
              {!field && settings.selection.hexId && (
                <p className="text-muted-foreground">
                  This hexagon is a region, not a field boundary.
                </p>
              )}
            </dl>
            {field?.boundary && (!info || info.error) && (
              <Alert variant="destructive" role="note">
                <AlertTitle>Boundary needs attention</AlertTitle>
                <AlertDescription>
                  {info?.error ??
                    "Use a simple closed polygon with at least three distinct vertices."}
                  {info && info.areaHectares > 5000 && (
                    <Button variant="outline" onClick={onAtlas}>
                      Explore this area in Atlas
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {settings.mode === "field" && (
              <>
                <Separator />
                <section
                  className="flex flex-col gap-3"
                  aria-label="Land cover"
                >
                  <h2 className="font-medium">Land cover at sampled point</h2>
                  {lookup.loading ? (
                    <p className="text-sm text-muted-foreground">
                      Checking USDA land cover…
                    </p>
                  ) : result ? (
                    <>
                      <p className="text-sm">
                        {result.status === "unavailable"
                          ? "Unverified"
                          : result.status === "non_cropland"
                            ? `Non-cropland · ${result.category}`
                            : `Recorded land cover · ${result.category}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.source}
                        {result.year ? ` · ${result.year}` : ""} · point sample
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {result.message}
                      </p>
                      {acceptedCrop && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!fieldDraft) beginField();
                            updateFieldDraft({
                              currentCrop: acceptedCrop,
                              cropSource: "cdl",
                            });
                          }}
                        >
                          Use detected crop
                        </Button>
                      )}
                      {result.status === "unavailable" && (
                        <Button variant="outline" onClick={lookup.retry}>
                          Retry land cover
                        </Button>
                      )}
                    </>
                  ) : null}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Annual recorded land cover is not today’s planted crop. A
                    point sample does not classify the whole boundary. Manual
                    crop selection is always available.
                  </p>
                </section>
              </>
            )}
            {status.layer && !status.failed && !status.loading && (
              <>
                <Separator />
                <section className="flex flex-col gap-2 text-sm">
                  <h2 className="font-medium">{status.layer.label}</h2>
                  <p>
                    Observed {status.layer.date} · {status.layer.units}
                  </p>
                  <p className="text-muted-foreground">
                    {status.layer.description}
                  </p>
                  {status.layer.legend && (
                    <img
                      src={status.layer.legend}
                      alt={`${status.layer.label} data legend`}
                      className="h-16 w-full object-contain object-left"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">NASA GIBS</p>
                </section>
              </>
            )}
            {!storageAvailable && (
              <Alert role="note">
                <AlertDescription>
                  Browser storage is unavailable. Changes are retained for this
                  session only.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter>
            {fieldDraft ? (
              <>
                <Button
                  disabled={invalid}
                  onClick={() => {
                    if (saveField()) onOpenChange(false);
                  }}
                >
                  Save field
                </Button>
                {fieldDraft.boundary && (
                  <Button variant="outline" onClick={onEditBoundary}>
                    Edit boundary
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    cancelField();
                    onOpenChange(false);
                  }}
                >
                  Cancel changes
                </Button>
              </>
            ) : settings.mode === "field" ? (
              <>
                <Button onClick={() => beginField()}>Edit field details</Button>
                {activeField?.boundary && (
                  <Button variant="outline" onClick={onEditBoundary}>
                    Edit boundary
                  </Button>
                )}
              </>
            ) : null}
            {activeField && (
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                Delete field
              </Button>
            )}
            {!fieldDraft && (
              <>
                <Button
                  variant="outline"
                  render={<Link href="/planner" />}
                  nativeButton={false}
                  onClick={() => onOpenChange(false)}
                >
                  Plan this field
                </Button>
                <Button
                  variant="ghost"
                  render={<Link href="/intel" />}
                  nativeButton={false}
                  onClick={() => onOpenChange(false)}
                >
                  Ask Meridian
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this field?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the field and its saved plans and economic inputs
              from this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Keep field
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (activeField) deleteField(activeField.id);
                setDeleting(false);
                onOpenChange(false);
              }}
            >
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
