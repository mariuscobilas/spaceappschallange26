"use client";

import { useState } from "react";
import { MapPinned, PencilRuler, Trash2, X } from "lucide-react";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";

export function MyFieldsPanel({
  mapReady,
  onSelectPoint,
  onDrawBoundary,
  onSelectField,
  onPlanField,
}: {
  mapReady: boolean;
  onSelectPoint: () => void;
  onDrawBoundary: () => void;
  onSelectField: (fieldId: string) => void;
  onPlanField: (fieldId: string) => void;
}) {
  const { fields, activeField, fieldDraft, draftDirty, fieldActionNotice, dismissFieldNotice, drawing, getFieldDeletionImpact, deleteField } = useMeridian();
  const mobile = useIsMobile();
  const drawingActive = drawing.mode === "polygon" || drawing.mode === "edit";
  const [open, setOpen] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingDelete = fields.find((field) => field.id === deletingFieldId);
  const deleteImpact = pendingDelete ? getFieldDeletionImpact(pendingDelete.id) : null;
  const deleteBlockedByDraft = !!pendingDelete && draftDirty && fieldDraft?.id === pendingDelete.id;
  const selectPoint = () => { setOpen(false); onSelectPoint(); };
  const drawBoundary = () => { setOpen(false); onDrawBoundary(); };
  const selectField = (id: string) => { setOpen(false); onSelectField(id); };
  const planField = (id: string) => { setOpen(false); onPlanField(id); };

  const content = <div className="flex h-full min-h-0 flex-col gap-4">
    {fieldActionNotice && !drawingActive && <div className="flex items-start gap-1 rounded-md bg-muted/50 py-2 pl-3 pr-1"><p role="status" className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">{fieldActionNotice}</p><Button size="icon-sm" variant="ghost" className="-my-1 shrink-0" aria-label="Dismiss field message" onClick={dismissFieldNotice}><X aria-hidden="true" /></Button></div>}
    {!drawingActive && <div className="flex shrink-0 flex-col gap-2">
      <Button className="min-h-11" disabled={!mapReady} onClick={drawBoundary}><PencilRuler data-icon="inline-start" />Draw boundary</Button>
      <Button variant="outline" className="min-h-11" disabled={!mapReady} onClick={selectPoint}><MapPinned data-icon="inline-start" />Select point</Button>
    </div>}
    {drawingActive && <div className="rounded-md border border-dashed p-3"><h3 className="text-sm font-medium">Field in progress</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Finish or cancel using the controls above the map. Your saved fields stay unchanged while you draw.</p></div>}
    {fields.length === 0 ? (!drawingActive && <div className="border-t pt-4"><h3 className="text-sm font-medium">No fields saved yet</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Draw a boundary to measure a field, or select a point to start with a location.</p></div>) : <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Saved fields">
      {fields.map((field) => <li key={field.id} className="rounded-md border p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Button variant="link" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left font-medium" disabled={drawingActive} aria-current={activeField?.id === field.id ? "true" : undefined} onClick={() => selectField(field.id)}>{field.name}</Button>
          {activeField?.id === field.id && <span className="shrink-0 text-xs text-muted-foreground">Selected</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{field.currentCrop[0].toUpperCase() + field.currentCrop.slice(1)} · {field.boundary ? "Boundary" : "Point field"}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" size="sm" className="min-h-11" disabled={drawingActive} onClick={() => planField(field.id)}>Plan this field</Button>
          <Button variant="outline" size="sm" className="min-h-11" disabled={drawingActive} aria-label={`Delete ${field.name}`} onClick={() => { setDeleteError(null); setDeletingFieldId(field.id); }}><Trash2 data-icon="inline-start" />Delete field</Button>
        </div>
      </li>)}
    </ul>}
  </div>;

  const panel = mobile ? <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button variant="outline" className="col-span-2 min-h-11 justify-self-start" />}>My fields ({fields.length})</SheetTrigger>
    <SheetContent side="right" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0" aria-label="My fields">
      <SheetHeader className="shrink-0 border-b pr-12"><SheetTitle>My fields</SheetTitle><SheetDescription>Select a saved field, create a point field, or draw a boundary.</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{content}</div>
    </SheetContent>
  </Sheet> : <aside className="flex min-h-0 w-72 shrink-0 flex-col gap-4 overflow-hidden border-r bg-background p-4" aria-label="My fields">
    <header><h2 className="font-semibold">My fields</h2><p className="mt-1 text-xs text-muted-foreground">{fields.length ? `${fields.length} saved ${fields.length === 1 ? "field" : "fields"}` : "Add a location or field boundary."}</p></header>
    <div className="min-h-0 flex-1">{content}</div>
  </aside>;

  return <>
    {panel}
    <AlertDialog open={!!deletingFieldId} onOpenChange={(value) => { if (!value) { setDeletingFieldId(null); setDeleteError(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {pendingDelete?.name ?? "field"}?</AlertDialogTitle>
          <AlertDialogDescription>
            {!pendingDelete
              ? "This field is no longer in your saved fields. Nothing has been deleted."
              : deleteBlockedByDraft
                ? "Save or cancel this field’s unsaved changes before deleting it."
                : `This removes the field${deleteImpact?.savedPlans ? `, ${deleteImpact.savedPlans} saved ${deleteImpact.savedPlans === 1 ? "plan" : "plans"}` : ""}${deleteImpact?.planDrafts ? `, ${deleteImpact.planDrafts} plan ${deleteImpact.planDrafts === 1 ? "draft" : "drafts"}` : ""}${deleteImpact?.economicsInputs ? `, and ${deleteImpact.economicsInputs} saved economics ${deleteImpact.economicsInputs === 1 ? "input" : "inputs"}` : ""} from this browser. Other saved fields will remain.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setDeletingFieldId(null)}>Keep field</Button>
          <Button variant="destructive" disabled={!pendingDelete || deleteBlockedByDraft} onClick={() => {
            if (!deletingFieldId || !deleteField(deletingFieldId)) {
              setDeleteError("This field could not be deleted because it is no longer available or has unsaved changes.");
              return;
            }
            setDeletingFieldId(null);
          }}>Delete permanently</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
