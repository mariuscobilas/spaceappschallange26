"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { calculateEconomics } from "@/lib/economics";
import { economicsUnitLabel, formatArea, fromCanonicalEconomicsValue } from "@/lib/units";
import { coverCrops, emptyPlan, validBudget, validDate, validPlanDraft, type EconomicsDraft, type FieldPlan } from "@/lib/workspace";
import { planTerminationDate } from "@/lib/plan-comparison";
import { useUnitSystem } from "@/hooks/use-unit-system";

const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
const economicKeys: (keyof EconomicsDraft)[] = ["grainPrice", "baselineYield", "yieldChange", "seedCost", "terminationCost", "subsidy"];

export default function PlanReviewWorkspace() {
  const { ready, activeField, settings, planDraft, savedPlan, boundaryArea, economicsDraft, savePlan } = useMeridian();
  const search = useSearchParams();
  const [units] = useUnitSystem();
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState("");
  const draft: FieldPlan = planDraft ?? savedPlan ?? emptyPlan;
  const skipBudget = search.get("budget") === "skip";
  useEffect(() => {
    setName(savedPlan?.name ?? "");
    setFeedback("");
  }, [activeField?.id, settings.crop]);
  if (!ready) return <section className="mx-auto max-w-4xl p-6" aria-busy="true">Loading plan…</section>;
  if (!activeField) return <section className="mx-auto max-w-3xl p-6"><Alert><AlertTitle>Choose a saved field first</AlertTitle><AlertDescription>A field specific plan needs a saved field boundary.</AlertDescription></Alert><Button className="mt-4" render={<Link href="/planner" />} nativeButton={false}>Open Field Planner</Button></section>;
  const effectiveArea = boundaryArea !== undefined ? boundaryArea : Number(draft.areaHa || economicsDraft.areaHa);
  const areaText = Number.isFinite(effectiveArea) && effectiveArea > 0 ? String(effectiveArea) : draft.areaHa;
  const candidate: FieldPlan = { ...draft, areaHa: areaText };
  const validArea = !candidate.areaHa || (Number.isFinite(Number(candidate.areaHa)) && Number(candidate.areaHa) > 0 && Number(candidate.areaHa) <= 5000);
  const validCalendar = validPlanDraft(candidate) && validDate(candidate.plantingDate, true) && validArea;
  const raw = economicKeys.map((key) => economicsDraft[key].trim());
  const hasBudget = raw.some(Boolean);
  const budgetDraft: EconomicsDraft = { ...economicsDraft, areaHa: Number.isFinite(effectiveArea) && effectiveArea > 0 ? String(effectiveArea) : economicsDraft.areaHa };
  const budgetComplete = hasBudget && validBudget(budgetDraft);
  const parsed = budgetComplete ? {
    grainPrice: Number(budgetDraft.grainPrice), baselineYield: Number(budgetDraft.baselineYield),
    yieldChange: Number(budgetDraft.yieldChange), seedCost: Number(budgetDraft.seedCost),
    terminationCost: Number(budgetDraft.terminationCost), subsidy: Number(budgetDraft.subsidy), areaHa: Number(budgetDraft.areaHa),
  } : null;
  const budget = parsed ? calculateEconomics(parsed) : null;
  const cropLabel = settings.crop[0].toUpperCase() + settings.crop.slice(1);
  const defaultName = `${activeField.name} · ${cropLabel} · ${candidate.plantingDate.slice(0, 4) || "Plan"}`.slice(0, 100);
  const chosenName = name.trim() || defaultName;
  const save = (alternative: boolean) => {
    setFeedback("");
    if (!validCalendar || chosenName.length > 100 || (!skipBudget && hasBudget && !budgetComplete)) {
      setFeedback("Plan could not be saved. Check the plan name, planting date, and budget assumptions.");
      return;
    }
    const ok = savePlan(candidate, { includeBudget: !!budget && !skipBudget, asAlternative: alternative, name: chosenName });
    setFeedback(ok ? `${alternative ? "Alternative plan" : "Plan"} saved on this device.` : "Plan kept for this session; saving on this device failed.");
  };
  const crop = coverCrops.find((item) => item.value === candidate.coverCrop)?.label ?? candidate.coverCrop;
  const area = Number.isFinite(effectiveArea) && effectiveArea > 0 ? formatArea(effectiveArea, units) : "Not available";
  const perHa = budget ? fromCanonicalEconomicsValue("seedCost", budget.returnAfterCoverCropCostsPerHa, units, settings.crop) : null;
  const perUnit = units === "us" ? "acre" : "hectare";
  return <section aria-label="Plan review" className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
    <header><p className="text-sm font-medium text-muted-foreground">Field Planner</p><h1 className="text-3xl font-semibold tracking-tight">Review and save plan</h1><p className="mt-2 text-muted-foreground">Confirm the field calendar and optional budget assumptions before saving.</p></header>
    {!validCalendar && <Alert variant="destructive"><AlertTitle>Planting date is required</AlertTitle><AlertDescription>Set a valid cash crop planting date and review the calendar before saving.</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle className="break-words">{activeField.name}</CardTitle><CardDescription>{cropLabel} · {area}</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">Cover crop</dt><dd>{crop}</dd><dt className="text-muted-foreground">Cash crop planting</dt><dd>{candidate.plantingDate || "Not set"}</dd><dt className="text-muted-foreground">Calculated termination</dt><dd>{validCalendar ? planTerminationDate({ ...candidate, location: settings.selection, crop: settings.crop, savedAt: "" }) : "Not set"}</dd><dt className="text-muted-foreground">Termination lead time</dt><dd>{candidate.terminationDays} days</dd><dt className="text-muted-foreground">Notes</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{candidate.notes || "None"}</dd></dl><Button className="mt-5" variant="outline" render={<Link href="/planner/calendar" />} nativeButton={false}>Edit calendar</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>Budget</CardTitle><CardDescription>{skipBudget ? "Budget intentionally skipped for this plan." : budget ? "After entered cover-crop costs and subsidy; other production expenses excluded." : hasBudget ? "Inputs are incomplete or invalid; no totals are shown." : "No budget assumptions entered."}</CardDescription></CardHeader><CardContent className="space-y-4">{budget && !skipBudget && perHa !== null ? <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 text-sm"><dt className="text-muted-foreground">Estimated return per {perUnit} ({economicsUnitLabel("seedCost", units, settings.crop)})</dt><dd>{money(perHa)}</dd><dt className="text-muted-foreground">Whole-field estimated return ({area})</dt><dd>{money(budget.totalReturnAfterCoverCropCosts)}</dd></dl> : <p className="text-sm text-muted-foreground">{skipBudget ? "This plan will not include a budget." : hasBudget ? "Complete all budget inputs to add calculated totals. No missing values are treated as zero." : "Add budget assumptions in Economics or continue with a calendar only."}</p>}<Button variant="outline" render={<Link href="/economics" />} nativeButton={false}>{budget && !skipBudget ? "Edit budget" : "Add budget assumptions"}</Button></CardContent></Card>
    <Field><FieldLabel htmlFor="plan-name">Plan name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="plan-name" value={name} maxLength={100} placeholder={defaultName} onChange={(event) => { setName(event.target.value); setFeedback(""); }} /></Field>
    {feedback && <Alert role="status"><AlertTitle>{feedback.startsWith("Plan could") ? "Save failed" : feedback.includes("failed") ? "Saved for this session" : "Saved"}</AlertTitle><AlertDescription>{feedback}</AlertDescription>{!feedback.startsWith("Plan could") && <Button className="mt-3" variant="outline" render={<Link href="/planner/saved" />} nativeButton={false}>View saved plans</Button>}</Alert>}
    <div className="flex flex-wrap gap-3"><Button disabled={!validCalendar || chosenName.length > 100 || (hasBudget && !budgetComplete && !skipBudget)} onClick={() => save(false)}>Save plan</Button><Button variant="outline" disabled={!validCalendar || chosenName.length > 100 || (hasBudget && !budgetComplete && !skipBudget)} onClick={() => save(true)}>Save as alternative</Button>{hasBudget && !budgetComplete && !skipBudget && <p className="w-full text-sm text-destructive" role="alert">Complete or correct the entered budget assumptions, or deliberately choose calendar only.</p>}{!skipBudget && <Button variant="ghost" render={<Link href="/planner/review?budget=skip" />} nativeButton={false}>Save calendar only</Button>}</div>
  </section>;
}
