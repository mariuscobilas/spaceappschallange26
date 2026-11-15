"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin, Plus, Sprout } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { crops, contextKey, initialSettings } from "@/lib/workspace";
import { fieldSelection } from "@/lib/fields/storage";
import { formatArea } from "@/lib/units";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { cn } from "@/lib/utils";
import type { PreviewCrop } from "@/lib/map/types";

const stepStoragePrefix = "meridian.planner-step.v1:";

export default function PlannerHome() {
  const router = useRouter();
  const { ready, fields, savedPlans, hasPlanChanges, hasWorkingPlan, chooseField } = useMeridian();
  const [unitSystem] = useUnitSystem();

  const openField = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;
    chooseField(fieldId);
    const selection = fieldSelection(field);
    const key = contextKey({ ...initialSettings, selection, crop: field.currentCrop as PreviewCrop });
    let step: string | null = null;
    try {
      step = window.localStorage.getItem(`${stepStoragePrefix}${key}`);
    } catch {
      // The calendar remains the reliable default when local storage is unavailable.
    }
    router.push(step === "/economics" || step === "/planner/review" ? step : "/planner/calendar");
  };

  if (!ready) return <div className="p-6 text-sm text-muted-foreground" role="status">Loading your fields…</div>;

  return (
    <section aria-label="Field library" className="mx-auto flex w-full max-w-5xl flex-col gap-7 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Field Planner</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Choose a field to plan</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Create a crop calendar and budget for one of your saved fields.</p>
        </div>
        <Link href="/planner/saved" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 shrink-0")}>Saved plans</Link>
      </header>

      {fields.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:p-8">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><MapPin aria-hidden="true" /></div>
            <div>
              <h2 className="text-lg font-semibold">Add your first field</h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">Save a field boundary and crop before starting a field-specific calendar.</p>
            </div>
            <Link href="/fields" className={cn(buttonVariants(), "min-h-11 gap-2")}><Plus aria-hidden="true" />Add first field</Link>
          </CardContent>
        </Card>
      ) : (
        <>
        <Link href="/fields" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 self-start")}>Manage or add fields</Link>
        <section aria-label="Saved fields" className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const crop = crops.find((item) => item.value === field.currentCrop);
            const plan = savedPlans.find(({ plan }) => plan.location.fieldId === field.id && plan.crop === field.currentCrop)?.plan;
            const changed = plan ? hasPlanChanges(plan) : hasWorkingPlan(field.id, field.currentCrop as PreviewCrop);
            const status = changed ? "Draft in progress" : plan ? "Plan saved" : "Not started";
            return (
              <Card key={field.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">{field.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{crop?.label ?? field.currentCrop}</p>
                    </div>
                    <Sprout className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                  </div>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-3 border-y py-3 text-sm">
                    <div><dt className="text-muted-foreground">Boundary area</dt><dd className="mt-1 font-medium">{field.areaHectares ? formatArea(field.areaHectares, unitSystem) : "Point field"}</dd></div>
                    <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1 font-medium">{status}</dd></div>
                  </dl>
                  <Button className="min-h-11 w-full justify-between" onClick={() => openField(field.id)}>
                    {changed ? "Continue draft" : plan ? "Continue plan" : "Create plan"}<ArrowRight aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
        </>
      )}
    </section>
  );
}
