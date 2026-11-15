"use client";

import { useState } from "react";
import { MapPinned, PencilRuler } from "lucide-react";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  const { fields, activeField } = useMeridian();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selectPoint = () => { setOpen(false); onSelectPoint(); };
  const drawBoundary = () => { setOpen(false); onDrawBoundary(); };
  const selectField = (id: string) => { setOpen(false); onSelectField(id); };
  const planField = (id: string) => { setOpen(false); onPlanField(id); };

  const content = <div className="flex h-full min-h-0 flex-col gap-4">
    <div className="flex shrink-0 flex-col gap-2">
      <Button variant="outline" className="min-h-11" disabled={!mapReady} onClick={selectPoint}><MapPinned data-icon="inline-start" />Select point</Button>
      <Button variant="outline" className="min-h-11" disabled={!mapReady} onClick={drawBoundary}><PencilRuler data-icon="inline-start" />Draw boundary</Button>
    </div>
    {fields.length === 0 ? <Empty className="border-0 px-2 py-6">
      <EmptyHeader><EmptyTitle>No fields saved yet</EmptyTitle><EmptyDescription>Select a point or draw a boundary to start a field.</EmptyDescription></EmptyHeader>
    </Empty> : <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Saved fields">
      {fields.map((field) => <li key={field.id} className="rounded-md border p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Button variant="link" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left font-medium" aria-current={activeField?.id === field.id ? "true" : undefined} onClick={() => selectField(field.id)}>{field.name}</Button>
          {activeField?.id === field.id && <span className="shrink-0 text-xs text-muted-foreground">Selected</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{field.currentCrop[0].toUpperCase() + field.currentCrop.slice(1)} · {field.boundary ? "Boundary" : "Point field"}</p>
        <Button variant="outline" size="sm" className="mt-3 min-h-10" onClick={() => planField(field.id)}>Plan this field</Button>
      </li>)}
    </ul>}
  </div>;

  if (mobile) return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button variant="outline" className="col-span-2 min-h-11 justify-self-start" />}>My fields ({fields.length})</SheetTrigger>
    <SheetContent side="right" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0" aria-label="My fields">
      <SheetHeader className="shrink-0 border-b pr-12"><SheetTitle>My fields</SheetTitle><SheetDescription>Select a saved field, create a point field, or draw a boundary.</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{content}</div>
    </SheetContent>
  </Sheet>;

  return <aside className="flex min-h-0 w-72 shrink-0 flex-col gap-4 overflow-hidden border-r bg-background p-4" aria-label="My fields">
    <header><h2 className="font-semibold">My fields</h2><p className="text-sm text-muted-foreground">Select or manage your saved fields.</p></header>
    <div className="min-h-0 flex-1">{content}</div>
  </aside>;
}
