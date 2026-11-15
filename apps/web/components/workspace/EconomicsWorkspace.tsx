"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { calculateEconomics } from "@/lib/economics";
import { economicsUnitLabel, formatArea, fromCanonicalEconomicsValue, toCanonicalEconomicsValue, type EconomicsUnitKey, type UnitSystem } from "@/lib/units";
import { contextKey, type EconomicsDraft } from "@/lib/workspace";

const fields: {
  key: keyof EconomicsDraft;
  label: string;
  suffix: string;
  help: string;
  min?: string;
  max?: string;
}[] = [
  {
    key: "grainPrice",
    label: "Grain price",
    suffix: "USD/tonne",
    help: "Your assumed price for the main crop.",
    min: "0",
  },
  {
    key: "baselineYield",
    label: "Baseline yield",
    suffix: "tonnes/ha",
    help: "Your assumed yield without the cover crop.",
    min: "0",
  },
  {
    key: "yieldChange",
    label: "Assumed yield change",
    suffix: "%",
    help: "An assumption to explore; values below −100% are not valid.",
    min: "-100",
  },
  {
    key: "seedCost",
    label: "Seed cost",
    suffix: "USD/ha",
    help: "Enter 0 if there is no seed cost.",
    min: "0",
  },
  {
    key: "terminationCost",
    label: "Termination cost",
    suffix: "USD/ha",
    help: "Enter 0 if there is no termination cost.",
    min: "0",
  },
  {
    key: "subsidy",
    label: "Subsidy",
    suffix: "USD/ha",
    help: "Enter expected EQIP or other support; use 0 if none applies.",
    min: "0",
  },
  {
    key: "areaHa",
    label: "Field area",
    suffix: "ha",
    help: "Use the managed field area, not the map cell area.",
    min: "0.01",
    max: "5000",
  },
];

const money = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const numberValue = (text: string) =>
  text.trim() === "" ? null : Number(text);

export default function EconomicsWorkspace() {
  const [unitSystem, setUnitSystem] = useUnitSystem();
  const [inputBuffers, setInputBuffers] = useState<Record<string, { system: UnitSystem; value: string }>>({});
  const chooseUnits = (value: string) => {
    if (value !== "metric" && value !== "us") return;
    setUnitSystem(value);
    setInputBuffers({});
  };
  const {
    ready,
    settings,
    economicsDraft,
    updateEconomics,
    savedPlan,
    storageAvailable,
    boundaryArea,
    activeField,
  } = useMeridian();
  const polygonArea =
    boundaryArea === undefined ? undefined : String(boundaryArea);
  const displayedDraft =
    polygonArea === undefined
      ? economicsDraft
      : { ...economicsDraft, areaHa: polygonArea };
  const crop = settings.crop;
  const displayValues = Object.fromEntries(fields.map((field) => {
    const value = numberValue(displayedDraft[field.key]);
    const converted = value !== null && Number.isFinite(value) && unitSystem === "us"
      ? String(Number(fromCanonicalEconomicsValue(field.key as EconomicsUnitKey, value, unitSystem, crop).toPrecision(8)))
      : displayedDraft[field.key];
    const buffer = inputBuffers[`${contextKey(settings)}:${field.key}`];
    // A measured polygon area is authoritative and read-only. A buffer from an
    // earlier manual edit must never make the displayed acreage disagree with
    // the canonical area used for the parcel total.
    const polygonAreaIsAuthoritative = field.key === "areaHa" && polygonArea !== undefined;
    return [field.key, !polygonAreaIsAuthoritative && buffer?.system === unitSystem ? buffer.value : converted];
  })) as unknown as EconomicsDraft;
  const parsed = Object.fromEntries(
    fields.map((field) => [field.key, numberValue(displayedDraft[field.key])]),
  ) as Record<keyof EconomicsDraft, number | null>;
  const invalid: Partial<Record<keyof EconomicsDraft, boolean>> = {};
  for (const field of fields) {
    const value = parsed[field.key];
    invalid[field.key] =
      value === null ||
      !Number.isFinite(value) ||
      (field.key === "yieldChange" ? value < -100 : value < 0) ||
      (field.key === "areaHa" && (value === 0 || value > 5000));
  }
  const complete = fields.filter((field) => field.key !== "areaHa").every((field) => !invalid[field.key]);
  const missingAssumptions = fields
    .filter((field) => field.key !== "areaHa" && parsed[field.key] === null)
    .map((field) => field.label.toLowerCase());
  const areaValid = !invalid.areaHa;
  const result =
    ready && complete
      ? calculateEconomics(
          { ...parsed,
            areaHa: areaValid ? parsed.areaHa! : 0,
          } as {
            grainPrice: number;
            baselineYield: number;
            yieldChange: number;
            seedCost: number;
            terminationCost: number;
            subsidy: number;
            areaHa: number;
          },
        )
      : null;
  const contextLabel = `${settings.selection.name} · ${settings.crop[0].toUpperCase() + settings.crop.slice(1)}`;
  const areaUnit = unitSystem === "us" ? "ac" : "ha";
  const perAreaMoney = (value: number) => money(fromCanonicalEconomicsValue("seedCost", value, unitSystem, crop));

  if (ready && !activeField) return (
    <section aria-label="Economics workspace" className="mx-auto max-w-3xl p-6">
      <Empty><EmptyHeader><EmptyTitle>Choose a saved field first</EmptyTitle><EmptyDescription>Budget assumptions are attached to a field. Select or create one in the Field Planner to continue.</EmptyDescription></EmptyHeader><Button render={<Link href="/planner" />} nativeButton={false}>Open Field Planner</Button></Empty>
    </section>
  );

  return (
    <section
      aria-label="Economics workspace"
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6"
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Field Planner
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Budget
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Compare revenue and cover crop costs for the selected field.
        </p>
      </header>

      <p className="max-w-3xl text-sm text-muted-foreground">
        Results are arithmetic scenarios from values entered below. Meridian does not provide observed yield or market price inputs; keep the baseline yield source and period in your Field Planner notes.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Display units</p>
          <p className="text-sm text-muted-foreground">Use the units you work with. Grain bushels use the selected crop’s standard weight.</p>
        </div>
        <ToggleGroup value={[unitSystem]} onValueChange={(values) => chooseUnits(values[0] ?? unitSystem)} aria-label="Display units">
          <ToggleGroupItem value="metric" aria-label="Metric units">Metric</ToggleGroupItem>
          <ToggleGroupItem value="us" aria-label="U.S. customary units">U.S.</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>
              {contextLabel}
              {savedPlan?.areaHa
                ? ` · saved plan area ${formatArea(Number(savedPlan.areaHa), unitSystem)}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {fields.map((field) => {
                const value = displayValues[field.key];
                const bad = value.trim() !== "" && invalid[field.key];
                const suffix = field.key === "yieldChange" ? "%" : economicsUnitLabel(field.key as EconomicsUnitKey, unitSystem, crop);
                const group = field.key === "grainPrice" ? "Revenue assumptions" : field.key === "seedCost" ? "Cover crop costs" : field.key === "areaHa" ? "Field area" : null;
                return (
                  <Fragment key={field.key}>
                  {group && <p className="col-span-full border-b pb-1 text-sm font-medium">{group}</p>}
                  <Field data-invalid={bad || undefined}>
                    <FieldLabel htmlFor={`economics-${field.key}`}>
                      {field.key === "grainPrice" && crop === "cotton" ? "Cotton lint price" : field.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({suffix})
                      </span>
                    </FieldLabel>
                    <Input
                      id={`economics-${field.key}`}
                      type="number"
                      step="any"
                      min={field.min}
                      max={field.key === "areaHa" && unitSystem === "us" ? String(5000 * 2.4710538147) : field.max}
                      inputMode="decimal"
                      value={value}
                      readOnly={
                        field.key === "areaHa" && polygonArea !== undefined
                      }
                      aria-invalid={bad || undefined}
                      aria-describedby={`economics-${field.key}-help`}
                      onChange={(event) => {
                        const input = event.target.value;
                        const bufferKey = `${contextKey(settings)}:${field.key}`;
                        setInputBuffers((current) => ({ ...current, [bufferKey]: { system: unitSystem, value: input } }));
                        updateEconomics({
                          ...economicsDraft,
                          [field.key]: input.trim() === "" ? "" : (() => {
                            const n = Number(input);
                            return Number.isFinite(n) ? String(toCanonicalEconomicsValue(field.key as EconomicsUnitKey, n, unitSystem, crop)) : economicsDraft[field.key];
                          })(),
                        });
                      }}
                    />
                    <FieldDescription id={`economics-${field.key}-help`}>
                      {field.key === "areaHa" && polygonArea !== undefined
                        ? "Calculated from saved field boundary."
                        : bad
                          ? field.key === "yieldChange"
                            ? "Enter a finite percentage of −100% or higher."
                            : field.key === "areaHa"
                            ? `Enter an area greater than 0 and no more than ${unitSystem === "us" ? (5000 * 2.4710538147).toLocaleString() + " ac" : "5,000 ha"}.`
                              : "Enter a finite value of 0 or greater."
                          : field.key === "yieldChange" ? "Assumed scenario input only; the app does not forecast yield changes." : field.help}
                    {field.key === "baselineYield" && crop === "cotton" ? (
                      <span className="mt-1 block">Cotton yield is treated as lint weight, not whole harvested seed cotton.</span>
                    ) : null}
                    </FieldDescription>
                  </Field>
                  </Fragment>
                );
              })}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated return</CardTitle>
            <CardDescription>
              Based only on the values entered here
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!complete ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Enter all assumptions</EmptyTitle>
                  <EmptyDescription>
                    {missingAssumptions.length
                      ? `Add ${missingAssumptions.join(", ")} to calculate this scenario. Zero is accepted for costs and subsidy.`
                      : "Correct the highlighted values to calculate this scenario. Zero is accepted for costs and subsidy."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : !result ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Values are too large to calculate</EmptyTitle>
                  <EmptyDescription>
                    Reduce one or more entered values so the resulting revenues
                    and totals stay within the calculator’s numeric range.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-sm text-muted-foreground">Estimated return / {areaUnit}</p><p className="text-2xl font-semibold tabular-nums">{perAreaMoney(result.returnAfterCoverCropCostsPerHa)}</p></div>
                  <div><p className="text-sm text-muted-foreground">Whole-field estimated return</p><p className="text-2xl font-semibold tabular-nums">{areaValid ? money(result.totalReturnAfterCoverCropCosts) : "Enter a valid field area"}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">After entered seed and termination costs, including subsidy. Other production expenses excluded.</p>
                <details className="border-t pt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Calculation details</summary>
                  <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
                    <dt>Revenue at assumed yield / {areaUnit}</dt><dd className="tabular-nums">{perAreaMoney(result.assumedRevenue)}</dd>
                    <dt>Seed + termination cost / {areaUnit}</dt><dd className="tabular-nums">{perAreaMoney(result.coverCropCost)}</dd>
                    <dt>Subsidy / {areaUnit}</dt><dd className="tabular-nums">{perAreaMoney(parsed.subsidy!)}</dd>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">Totals use unrounded values and the managed field area.</p>
                </details>
              </FieldGroup>
            )}
          </CardContent>
        </Card>
      </div>

      {!storageAvailable && (
        <Alert variant="destructive">
          <AlertTitle>Local storage unavailable</AlertTitle>
          <AlertDescription>
            Your inputs remain available for this session, but changes could not
            be saved on this device.
          </AlertDescription>
        </Alert>
      )}
      <nav aria-label="Next steps" className="flex flex-wrap gap-3">
        <Button render={<Link href="/planner/review" />} nativeButton={false}>Review plan</Button><Button variant="ghost" render={<Link href="/planner/review?budget=skip" />} nativeButton={false}>Continue without budget</Button>
      </nav>
    </section>
  );
}
