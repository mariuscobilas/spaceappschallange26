"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { coverCrops, type FieldPlan, type SavedPlan } from "@/lib/workspace";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { formatArea } from "@/lib/units";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { planComparisonText, planTerminationDate, plansHaveDifferentContexts } from "@/lib/plan-comparison";

function samePlanDraft(plan: SavedPlan, draft: FieldPlan | undefined) {
  return !!draft && ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].every((key) =>
    plan[key as keyof FieldPlan] === draft[key as keyof FieldPlan]);
}

export default function SavedPlansWorkspace() {
  const { ready, savedPlans, fields, getPlanDraft, openSavedPlan, deleteSavedPlan } = useMeridian();
  const router = useRouter();
  const [unitSystem] = useUnitSystem();
  const [pending, setPending] = useState<{ key: string; restore: boolean } | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteSaveFailed, setDeleteSaveFailed] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  if (!ready) return <section className="mx-auto max-w-5xl p-6" aria-label="Saved plans workspace" aria-busy="true">Loading saved plans…</section>;

  const open = (key: string, restore: boolean) => {
    if (openSavedPlan(key, restore)) router.push("/planner");
    setPending(null);
  };
  const selected = selectedKeys.map((key) => savedPlans.find((item) => item.key === key)).filter((item): item is (typeof savedPlans)[number] => !!item);
  const selectionIsStale = selected.length !== selectedKeys.length;
  const toggleCompare = (key: string, checked: boolean) => setSelectedKeys((current) => checked
    ? [...current.filter((item) => item !== key && savedPlans.some((plan) => plan.key === item)), ...(current.filter((item) => savedPlans.some((plan) => plan.key === item)).length < 2 ? [key] : [])]
    : current.filter((item) => item !== key && savedPlans.some((plan) => plan.key === item)));
  const exportComparison = () => {
    if (selected.length !== 2) return;
    const displayNames: [string, string] = selected.map(({ plan }) => plan.location.fieldId ? fields.find((field) => field.id === plan.location.fieldId)?.name ?? plan.location.name : plan.location.name) as [string, string];
    const content = planComparisonText(selected[0].plan, selected[1].plan, unitSystem, displayNames);
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "field-shift-plan-comparison.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return <section aria-label="Saved plans workspace" className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">Field Planner</p><h1 className="text-3xl font-semibold tracking-tight">Saved plans</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Confirmed planting and cover crop termination plans saved on this device.</p></div>
    </header>
    {savedPlans.length === 0 ? <Empty>
      <EmptyHeader><EmptyTitle>No saved plans yet</EmptyTitle><EmptyDescription>Save a field plan to keep it here for later.</EmptyDescription></EmptyHeader>
      <Button onClick={() => router.push("/planner")}>Create a plan</Button>
    </Empty> : <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" role="status">{showComparison ? `${selected.length} of 2 selected. Choose plans below to compare their calendars.` : `${savedPlans.length} saved ${savedPlans.length === 1 ? "plan" : "plans"}`}</p>
        <Button variant="outline" onClick={() => { setShowComparison((visible) => !visible); setSelectedKeys([]); }} aria-expanded={showComparison}>{showComparison ? "Close comparison" : "Compare plans"}</Button>
      </div>
      {showComparison && selectionIsStale && <Alert role="alert"><AlertTitle>Selection updated</AlertTitle><AlertDescription>A selected plan was removed. Clear the selection or select another saved plan.</AlertDescription><Button variant="outline" onClick={() => setSelectedKeys(selected.map((item) => item.key))}>Clear removed selection</Button></Alert>}
      <div className="grid gap-4 md:grid-cols-2">
      {savedPlans.map(({ key, plan }) => {
        const field = plan.location.fieldId ? fields.find((item) => item.id === plan.location.fieldId) : undefined;
        const name = field?.name ?? plan.location.name;
        const currentDraft = getPlanDraft(plan);
        const differs = !!currentDraft && !samePlanDraft(plan, currentDraft);
        const coverCrop = coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop;
        return <Card key={key} data-testid="saved-plan-card">
          <CardHeader><CardTitle className="break-words">{name}</CardTitle><CardDescription>{plan.crop[0].toUpperCase() + plan.crop.slice(1)} · Saved {new Date(plan.savedAt).toLocaleDateString()}</CardDescription></CardHeader>
          <CardContent><dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 gap-y-3 text-sm sm:gap-x-4">
            <dt className="text-muted-foreground">Cover crop</dt><dd>{coverCrop}</dd>
            <dt className="text-muted-foreground">Lead time</dt><dd>{plan.terminationDays} days</dd>
            <dt className="text-muted-foreground">Cash crop planting</dt><dd>{plan.plantingDate || "Not set"}</dd>
            <dt className="text-muted-foreground">Calculated termination</dt><dd>{planTerminationDate(plan)}</dd>
            <dt className="text-muted-foreground">Field area</dt><dd className="min-w-0 break-words">{plan.areaHa ? formatArea(Number(plan.areaHa), unitSystem) : "Not set"}</dd>
          </dl>{differs && <p role="status" className="mt-4 rounded-md bg-muted p-3 text-sm">A newer working draft exists for this field and crop. You can open it or explicitly restore this saved version.</p>}</CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button onClick={() => differs ? setPending({ key, restore: false }) : open(key, false)}>Open in Planner</Button>
            {differs && <Button variant="outline" onClick={() => setPending({ key, restore: true })}>Restore saved version</Button>}
            {showComparison && <Button variant={selectedKeys.includes(key) ? "secondary" : "outline"} disabled={!selectedKeys.includes(key) && selected.length >= 2} aria-pressed={selectedKeys.includes(key)} onClick={() => toggleCompare(key, !selectedKeys.includes(key))}>{selectedKeys.includes(key) ? "Selected for comparison" : "Compare this plan"}</Button>}
            <Button className="sm:ml-auto" variant="ghost" onClick={() => setDeleteKey(key)}>Delete</Button>
          </CardFooter>
        </Card>;
      })}
      </div>
      {showComparison && selected.length === 2 && <Card aria-labelledby="comparison-title">
        <CardHeader><CardTitle id="comparison-title">Plan comparison</CardTitle><CardDescription>Manual calendar plans. This is not a controlled model comparison.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4" aria-live="polite">
          {plansHaveDifferentContexts(selected[0].plan, selected[1].plan) && <Alert role="alert"><AlertTitle>Different field or crop contexts</AlertTitle><AlertDescription>These plans describe different field or cash crop contexts.</AlertDescription></Alert>}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {selected.map(({ key, plan }) => { const name = plan.location.fieldId ? fields.find((field) => field.id === plan.location.fieldId)?.name ?? plan.location.name : plan.location.name; return <article key={key} className="min-w-0 rounded-md border p-4"><h3 className="break-words font-semibold">{name} · {plan.crop}</h3><dl className="mt-3 grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Cover crop</dt><dd className="min-w-0 break-words">{coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop}</dd>
                <dt className="text-muted-foreground">Cash crop</dt><dd className="min-w-0 break-words">{plan.crop}</dd><dt className="text-muted-foreground">Planting</dt><dd className="min-w-0 break-words">{plan.plantingDate || "Not set"}</dd><dt className="text-muted-foreground">Termination</dt><dd className="min-w-0 break-words">{planTerminationDate(plan)}</dd>
                <dt className="text-muted-foreground">Lead time</dt><dd className="min-w-0 break-words">{plan.terminationDays} days</dd><dt className="text-muted-foreground">Area</dt><dd className="min-w-0 break-words">{plan.areaHa ? formatArea(Number(plan.areaHa), unitSystem) : plan.location.areaHectares ? formatArea(plan.location.areaHectares, unitSystem) : "Not set"}</dd>
                <dt className="col-span-2 text-muted-foreground">Notes</dt><dd className="col-span-2 min-w-0 whitespace-pre-wrap break-words">{plan.notes.trim() || "None"}</dd>
              </dl></article>; })}
          </div>
          <p className="text-sm text-muted-foreground">Termination dates are calculated from saved planting dates and lead times; no model prediction is included.</p>
          <Button className="self-start" variant="outline" onClick={exportComparison}>Download comparison (.txt)</Button>
        </CardContent>
      </Card>}
    </>}
    {deleteSaveFailed && <Alert variant="destructive"><AlertTitle>Plan deletion could not be saved</AlertTitle><AlertDescription>The plan is hidden for this session, but local storage could not persist its removal. It may return after reload.</AlertDescription></Alert>}
    <AlertDialog open={!!pending} onOpenChange={(openState) => !openState && setPending(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pending?.restore ? "Restore saved version?" : "Open the working draft?"}</AlertDialogTitle>
        <AlertDialogDescription>{pending?.restore ? "This replaces the newer working draft for this field and crop with the confirmed saved version." : "A newer working draft exists. It will remain in place when you open the Planner."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
          {pending && <AlertDialogAction onClick={() => open(pending.key, pending.restore)}>{pending.restore ? "Restore saved version" : "Open working draft"}</AlertDialogAction>}
        </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!deleteKey} onOpenChange={(openState) => !openState && setDeleteKey(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete saved plan?</AlertDialogTitle><AlertDialogDescription>This removes only the confirmed plan. The field and its economics data will remain.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteKey && !deleteSavedPlan(deleteKey)) setDeleteSaveFailed(true); setDeleteKey(null); }}>Delete plan</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}
