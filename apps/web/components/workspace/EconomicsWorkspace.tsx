"use client";

import Link from "next/link";
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
import { Separator } from "@/components/ui/separator";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { calculateEconomics } from "@/lib/economics";
import type { EconomicsDraft } from "@/lib/workspace";

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
  const {
    ready,
    settings,
    economicsDraft,
    updateEconomics,
    savedPlan,
    storageAvailable,
    boundaryArea,
  } = useMeridian();
  const polygonArea =
    boundaryArea === undefined ? undefined : String(boundaryArea);
  const displayedDraft =
    polygonArea === undefined
      ? economicsDraft
      : { ...economicsDraft, areaHa: polygonArea };
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
  const complete = fields.every((field) => !invalid[field.key]);
  const result =
    ready && complete
      ? calculateEconomics(
          parsed as {
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

  return (
    <section
      aria-label="Economics workspace"
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6"
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Farm economics
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Explore your assumptions
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Compare user-entered revenue and cover crop costs for the selected
          field. No market prices or yield changes are supplied by the app.
        </p>
      </header>

      <Alert>
        <AlertTitle>Assumption calculator</AlertTitle>
        <AlertDescription>
          Results are arithmetic scenarios calculated only from the assumptions
          you enter.
        </AlertDescription>
      </Alert>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>
              {contextLabel}
              {savedPlan?.areaHa
                ? ` · saved plan area ${savedPlan.areaHa} ha`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {fields.map((field) => {
                const value = displayedDraft[field.key];
                const bad = value.trim() !== "" && invalid[field.key];
                return (
                  <Field key={field.key} data-invalid={bad || undefined}>
                    <FieldLabel htmlFor={`economics-${field.key}`}>
                      {field.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({field.suffix})
                      </span>
                    </FieldLabel>
                    <Input
                      id={`economics-${field.key}`}
                      type="number"
                      step="any"
                      min={field.min}
                      max={field.max}
                      inputMode="decimal"
                      value={value}
                      readOnly={
                        field.key === "areaHa" && polygonArea !== undefined
                      }
                      aria-invalid={bad || undefined}
                      onChange={(event) =>
                        updateEconomics({
                          ...economicsDraft,
                          [field.key]: event.target.value,
                        })
                      }
                    />
                    <FieldDescription>
                      {field.key === "areaHa" && polygonArea !== undefined
                        ? "Calculated from saved field boundary."
                        : bad
                          ? field.key === "yieldChange"
                            ? "Enter a finite percentage of −100% or higher."
                            : field.key === "areaHa"
                              ? "Enter an area greater than 0 and no more than 5,000 ha."
                              : "Enter a finite value of 0 or greater."
                          : field.help}
                    </FieldDescription>
                  </Field>
                );
              })}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scenario result</CardTitle>
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
                    Results appear after every input contains a valid number.
                    Zero is accepted for costs and subsidy.
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
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Net change per hectare
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {money(result.netChangePerHa)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total for {parsed.areaHa} ha
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {money(result.totalNetChange)}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Baseline revenue / ha
                    </span>
                    <span className="tabular-nums">
                      {money(result.baselineRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Revenue at assumed yield / ha
                    </span>
                    <span className="tabular-nums">
                      {money(result.assumedRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Seed + termination cost / ha
                    </span>
                    <span className="tabular-nums">
                      {money(result.coverCropCost)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Subsidy / ha</span>
                    <span className="tabular-nums">
                      {money(parsed.subsidy!)}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Break-even yield change:{" "}
                  {result.breakEvenYieldChange === null
                    ? "Unavailable when baseline revenue is zero."
                    : `${result.breakEvenYieldChange.toFixed(2)}%`}
                </p>
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
      <p className="text-sm text-muted-foreground">
        Use{" "}
        <Link className="underline underline-offset-4" href="/planner">
          Field Planner
        </Link>{" "}
        to record management assumptions, or{" "}
        <Link className="underline underline-offset-4" href="/">
          return to the map
        </Link>{" "}
        to change the selected location or crop.
      </p>
    </section>
  );
}
