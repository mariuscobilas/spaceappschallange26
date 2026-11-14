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
    const displayNames: [string, string] = [selected[0].plan.location.fieldId ? fields.find((field) => field.id === selected[0].plan.location.fieldId)?.name ?? selected[0].plan.location.name : selected[0].plan.location.name, selected[1].plan.location.fieldId ? fields.find((field) => field.id === selected[1].plan.location.fieldId)?.name ?? selected[1].plan.location.name : selected[1].plan.location.name];
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
      <Button variant="outline" onClick={() => router.push("/planner")}>Back to Planner</Button>
    </header>
    {savedPlans.length === 0 ? <Empty>
      <EmptyHeader><EmptyTitle>No saved plans yet</EmptyTitle><EmptyDescription>Save a field plan to keep it here for later.</EmptyDescription></EmptyHeader>
      <Button onClick={() => router.push("/planner")}>Create a plan</Button>
    </Empty> : <>
      <Card aria-labelledby="compare-plans-title">
        <CardHeader><CardTitle id="compare-plans-title">Compare two saved plans</CardTitle><CardDescription>Select two plans to compare their manual calendar details. Saved plans are available per field and crop.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectionIsStale && <Alert role="alert"><AlertTitle>Selection updated</AlertTitle><AlertDescription>A selected plan was removed. Clear the selection or select another saved plan.</AlertDescription><Button variant="outline" onClick={() => setSelectedKeys(selected.map((item) => item.key))}>Clear removed selection</Button></Alert>}
          <fieldset className="flex flex-wrap gap-x-5 gap-y-3">
            <legend className="sr-only">Plans to compare</legend>
            {savedPlans.map(({ key, plan }) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={selectedKeys.includes(key)} disabled={!selectedKeys.includes(key) && selected.length >= 2} onChange={(event) => toggleCompare(key, event.target.checked)} aria-label={`Compare ${plan.location.name} ${plan.crop} plan`} />
              {plan.location.name} · {plan.crop}
            </label>)}
          </fieldset>
          {selected.length === 2 && <div aria-live="polite" className="flex flex-col gap-4">
            {plansHaveDifferentContexts(selected[0].plan, selected[1].plan) && <Alert role="alert"><AlertTitle>Different field or crop contexts</AlertTitle><AlertDescription>These plans describe different field or cash crop contexts. Use this as a comparison of saved manual plans, not a controlled model comparison.</AlertDescription></Alert>}
            <div className="grid gap-4 md:grid-cols-2">
              {selected.map(({ key, plan }) => <article key={key} className="rounded-md border p-4"><h3 className="font-semibold">{plan.location.name} · {plan.crop}</h3><dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Cover crop</dt><dd>{coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop}</dd>
                <dt className="text-muted-foreground">Planting</dt><dd>{plan.plantingDate || "Not set"}</dd><dt className="text-muted-foreground">Termination</dt><dd>{planTerminationDate(plan)}</dd>
                <dt className="text-muted-foreground">Lead time</dt><dd>{plan.terminationDays} days</dd><dt className="text-muted-foreground">Area</dt><dd>{plan.areaHa ? formatArea(Number(plan.areaHa), unitSystem) : "Not set"}</dd>
                <dt className="text-muted-foreground">Notes</dt><dd className="max-w-56 whitespace-pre-wrap break-words">{plan.notes.trim() || "None"}</dd>
              </dl></article>)}
            </div>
            <p className="text-sm text-muted-foreground">Manual calendar comparison. Termination dates are calculated from saved planting dates and lead times; no model prediction is included.</p>
            <Button className="self-start" variant="outline" onClick={exportComparison}>Download comparison (.txt)</Button>
          </div>}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
      {savedPlans.map(({ key, plan }) => {
        const field = plan.location.fieldId ? fields.find((item) => item.id === plan.location.fieldId) : undefined;
        const name = field?.name ?? plan.location.name;
        const currentDraft = getPlanDraft(plan);
        const differs = !!currentDraft && !samePlanDraft(plan, currentDraft);
        const coverCrop = coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop;
        return <Card key={key} data-testid="saved-plan-card">
          <CardHeader><CardTitle>{name}</CardTitle><CardDescription>{plan.crop[0].toUpperCase() + plan.crop.slice(1)} · Saved {new Date(plan.savedAt).toLocaleDateString()}</CardDescription></CardHeader>
          <CardContent><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Cover crop</dt><dd>{coverCrop}</dd>
            <dt className="text-muted-foreground">Lead time</dt><dd>{plan.terminationDays} days</dd>
            <dt className="text-muted-foreground">Cash crop planting</dt><dd>{plan.plantingDate || "Not set"}</dd>
            <dt className="text-muted-foreground">Calculated termination</dt><dd>{planTerminationDate(plan)}</dd>
            <dt className="text-muted-foreground">Field area</dt><dd>{plan.areaHa ? formatArea(Number(plan.areaHa), unitSystem) : "Not set"}</dd>
          </dl>{differs && <p role="status" className="mt-4 rounded-md bg-muted p-3 text-sm">A newer working draft exists for this field and crop. You can open it or explicitly restore this saved version.</p>}</CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button onClick={() => differs ? setPending({ key, restore: false }) : open(key, false)}>Open in Planner</Button>
            {differs && <Button variant="outline" onClick={() => setPending({ key, restore: true })}>Restore saved version</Button>}
            <Button className="sm:ml-auto" variant="ghost" onClick={() => setDeleteKey(key)}>Delete</Button>
          </CardFooter>
        </Card>;
      })}
      </div>
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
