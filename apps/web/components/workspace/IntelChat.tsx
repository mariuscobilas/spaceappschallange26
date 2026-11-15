"use client";

import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, LoaderCircle, RotateCcw, Square, Sprout } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnalyzeResult } from "@spaceapps/shared";
import type { MeridianChatContext, MeridianPlanProposal, MeridianSeasonFactsUpdate } from "@spaceapps/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { getConversation, getConversationIssue, saveConversation, startConversation, clearConversationHistory } from "@/components/workspace/intel-chat-session";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Message, MessageContent as MessageRowContent, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { InputGroup, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { readSeasonFacts, saveMeridianSeasonFacts, seasonFactsStorageAvailable } from "@/lib/meridian/context";
import { economicsUnitLabel, fromCanonicalEconomicsValue } from "@/lib/units";

export type IntelChatContext = MeridianChatContext;

function format(value: number | null | undefined, digits = 3) {
  return value == null ? "Unavailable" : value.toFixed(digits);
}

function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "Request failed");
  try {
    const parsed = JSON.parse(raw) as { error?: string | { message?: string }; message?: string; detail?: string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    return parsed.message ?? parsed.detail ?? "Meridian could not complete that request. Please retry.";
  } catch {
    return raw.length > 240 ? "Meridian could not complete that request. Please retry." : raw;
  }
}

function markdownWithoutRawHtml(source: string) {
  return source.replace(/<\/?[A-Za-z][^>]*>/g, (tag) => tag.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
}

function ComparisonCard({ result }: { result: AnalyzeResult }) {
  const scenarioLabel = (scenario: AnalyzeResult["scenarios"][number]) => scenario.scenario.replaceAll("_", " ");
  const input = result.request.scenario;
  const economics = result.request.economics;
  const insufficientEvidence = !result.recommendation.validated || result.scenarios.some((scenario) =>
    scenario.quality.reliability.toLowerCase() === "invalid" || !scenario.quality.usable_for_recommendation,
  );
  return (
    <div className="mt-3 w-full max-w-2xl rounded-lg border bg-card text-card-foreground">
      <div className="flex flex-col gap-2 p-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Clovis reference simulation</h3>
          <Badge variant="secondary">Experimental</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {result.execution_mode} result · {result.model.name} · {result.model.status.replaceAll("_", " ")} · {result.sensor_depth_cm} cm at daily-average resolution in {result.moisture_unit}
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
        <p className="text-muted-foreground">Unvalidated for planting recommendations. Clovis site · {result.sensor_depth_cm} cm soil sensor depth · {result.moisture_temporal_resolution.replaceAll("_", " ")} · starting moisture {format(result.initial_moisture.value_m3_m3)} m³/m³</p>
        {insufficientEvidence && <div role="note" className="rounded-md border border-destructive/30 bg-destructive/5 p-3"><p className="font-semibold">Insufficient evidence for a planting recommendation.</p><p className="text-muted-foreground">This comparison cannot guide a planting decision. No economic return estimate is supported; the moisture-to-yield conversion is illustrative only.</p></div>}
        <div className="grid gap-2 sm:grid-cols-3" aria-label="Scenario outcomes">
          {result.scenarios.map((scenario) => (
            <div key={scenario.scenario} className="rounded-md border p-3">
              <p className="font-medium capitalize">{scenarioLabel(scenario)}</p>
              <p className="mt-1">Cover {format(scenario.moisture.cover_at_planting_m3_m3)} · fallow {format(scenario.moisture.fallow_at_planting_m3_m3)} m³/m³ at planting</p>
              <p className="text-muted-foreground">7-day difference {format(scenario.moisture.final_7_day_difference_m3_m3)} m³/m³</p>
              <p className="text-muted-foreground">Quality: {scenario.quality.reliability} · water risk: {scenario.water_risk.level}</p>
              {scenario.quality.flags.length > 0 && <p className="text-xs text-muted-foreground">{scenario.quality.flags.map((flag) => flag.replaceAll("_", " ")).join(" · ")}</p>}
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer font-medium">Inputs and assumptions</summary>
          <div className="mt-3 flex flex-col gap-3">
          <p className="font-medium">Simulation inputs</p>
          <p className="text-muted-foreground">Decision {input.decision_date} · {input.cover_crop.replaceAll("_", " ")} cover planted {input.cover_planting_date}, terminated {input.cover_termination_date} · {input.next_crop.replaceAll("_", " ")} planted {input.next_crop_planting_date}</p>
          <p className="text-muted-foreground">Initial moisture input: {input.initial_soil_moisture_m3_m3 == null ? "training fallow median" : `${format(input.initial_soil_moisture_m3_m3)} m³/m³`} · source dates: {result.initial_moisture.source_dates.join(", ") || "not supplied"}</p>
          <p className="text-muted-foreground">Irrigation: {input.irrigation_schedule.length ? input.irrigation_schedule.map((event) => `${event.date}: ${event.amount_mm} mm`).join("; ") : "none"}</p>
          <p className="mt-2 font-medium">Model validation</p>
          <p className="text-muted-foreground">Validation MAE {format(result.model.validation_mae_m3_m3)} m³/m³ · persistence MAE {format(result.model.persistence_validation_mae_m3_m3)} m³/m³ · seasonal validation {result.model.seasonal_validation_status.replaceAll("_", " ")}</p>
          <p className="font-medium">Recommendation status</p>
          <p className="text-muted-foreground">{insufficientEvidence ? "Insufficient evidence for a planting recommendation." : "No validated planting recommendation is available."} Status {result.recommendation.status}; validated {String(result.recommendation.validated)}. Diagnostic reason codes: {result.recommendation.reason_codes.filter((code) => code !== "positive_incremental_return_in_all_cases").map((code) => code.replaceAll("_", " ")).join(" · ") || "none returned"}. The provisional backend directive is suppressed.</p>
          <p className="font-medium">Economics assumptions · illustrative only</p>
          <p className="text-muted-foreground">Baseline wheat yield {economics.baseline_wheat_yield_t_ha} t/ha · wheat price ${economics.wheat_price_usd_t}/t · seed ${economics.seed_cost_usd_ha}/ha · establishment ${economics.establishment_cost_usd_ha}/ha · termination ${economics.termination_cost_usd_ha}/ha · other ${economics.additional_cost_usd_ha}/ha</p>
          <p className="text-muted-foreground">Net cover revenue ${economics.net_cover_revenue_usd_ha}/ha · incentive ${economics.incentive_usd_ha}/ha · additional yield sensitivity {economics.moisture_to_yield_sensitivity} · defaults are illustrative and are not based on market prices or agronomic calibration.</p>
          <p className="text-muted-foreground">Illustrative financial diagnostics only, not a return estimate: {format(result.financial_summary.minimum_incremental_net_benefit_usd_ha, 2)} to {format(result.financial_summary.maximum_incremental_net_benefit_usd_ha, 2)} USD/ha; unweighted scenario range ({result.financial_summary.calculated_cases}/{result.financial_summary.case_count} calculated cases). The moisture-to-yield conversion is illustrative only and cannot support an economic recommendation.</p>
          <p className="text-muted-foreground">Risk rule thresholds: moderate {result.request.risk_rules.moderate_relative_moisture_loss} · high {result.request.risk_rules.high_relative_moisture_loss} relative moisture loss.</p>
          {result.scenarios.map((scenario) => <p key={scenario.scenario} className="text-muted-foreground">{scenarioLabel(scenario)}: rainfall percentile requested {scenario.requested_rainfall_percentile}, actual {scenario.actual_rainfall_percentile}; {scenario.eligible_historical_seasons} eligible seasons. Quality {scenario.quality.reliability}; recommendation usable {String(scenario.quality.usable_for_recommendation)}. Illustrative diagnostic yield values: fallow {format(scenario.finances.fallow_wheat_yield_t_ha, 2)} t/ha · cover {format(scenario.finances.cover_wheat_yield_t_ha, 2)} t/ha · illustrative net-benefit calculation {format(scenario.finances.incremental_net_benefit_usd_ha, 2)} USD/ha; not a return estimate.</p>)}
          {result.assumptions.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{result.assumptions.map((assumption, index) => <li key={`${index}-${assumption}`}>{assumption}</li>)}</ul>}
          </div>
        </details>
      </div>
    </div>
  );
}

function ToolResult({ part, context, onApplyProposal }: { part: unknown; context: MeridianChatContext; onApplyProposal: (proposal: MeridianPlanProposal) => boolean }) {
  const item = part as { state?: string; output?: { ok?: boolean; result?: AnalyzeResult; error?: string }; errorText?: string };
  if (item.state === "input-streaming" || item.state === "input-available") return <p className="mt-2 text-sm text-muted-foreground">Running Clovis comparison…</p>;
  const output = item.output;
  if (item.state !== "output-available" || !output) return item.state === "output-error" ? <p className="mt-2 text-sm text-destructive">Comparison failed: {item.errorText ?? "Please retry."}</p> : null;
  return output.ok && output.result ? <ComparisonCard result={output.result} /> : <p className="mt-2 text-sm text-destructive">Comparison failed: {output.error ?? "Please retry."}</p>;
}

function MeridianToolResult({ name, part, context, onApplyProposal, onSeasonFactApplied }: { name: string; part: unknown; context: MeridianChatContext; onApplyProposal: (proposal: MeridianPlanProposal) => boolean; onSeasonFactApplied: (year: number) => void }) {
  const item = part as { state?: string; output?: { ok?: boolean; result?: unknown; error?: string }; errorText?: string };
  const label = ({ getFieldEvidence: "Field evidence", getCropReferences: "Crop references", compareCropScenarios: "Cash crop comparison", rememberSeasonFacts: "Season facts", preparePlanDraft: "Plan draft" } as Record<string, string>)[name] ?? name;
  if (item.state === "input-streaming" || item.state === "input-available") return <p className="text-sm text-muted-foreground" role="status">{label} in progress…</p>;
  if (item.state === "output-error" || item.output?.ok === false) return <p className="text-sm text-destructive" role="alert">{label} failed: {item.output?.error ?? item.errorText ?? "Please retry."}</p>;
  if (item.state !== "output-available" || !item.output?.result) return null;
  const result = item.output.result as Record<string, unknown>;
  if (name === "compareCropScenarios" && Array.isArray(result.rows)) {
    const rows = result.rows as Array<Record<string, unknown>>;
    const rankedCrops = Array.isArray(result.ranking) ? result.ranking.map(String) : [];
    const orderedRows = [...rows].sort((a, b) => {
      const ai = rankedCrops.indexOf(String(a.crop)); const bi = rankedCrops.indexOf(String(b.crop));
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    });
    const units = context.displayUnits ?? "metric";
    const value = (raw: unknown, key: "baselineYield" | "grainPrice" | "seedCost", crop: string) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return "Unavailable";
      const converted = fromCanonicalEconomicsValue(key, raw, units, crop);
      return `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${economicsUnitLabel(key, units, crop)}`;
    };
    return <section className="mt-3 w-full rounded-lg border bg-card p-4 text-card-foreground" aria-label="Cash crop comparison">
      <h3 className="font-semibold">Historical cash crop screen</h3><p className="mb-3 text-sm text-muted-foreground">USDA ERS reference year {String(result.referenceYear ?? "unavailable")} · planning year {String(result.planningYear ?? context.planningYear ?? "unspecified")} · {result.geographicMatch === "national_fallback" ? "National reference fallback" : result.geographicMatch === "partial_regional" ? "Partial regional coverage" : result.geographicMatch === "regional" ? "Regional references" : "Geography unspecified"}{result.geographicRegion ? ` (${String(result.geographicRegion)})` : ""} · references {result.referenceStatus === "stale_fallback" ? "using a previously verified fallback" : result.referenceStatus === "available" ? "available" : "unavailable"}. {String(result.referenceMessage ?? "")} Historical screen, not a field forecast or crop recommendation.</p>
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[48rem] border-collapse text-left text-sm"><thead><tr className="border-b text-muted-foreground">{["Crop", `Yield (${units === "us" ? "crop-specific US units" : "t/ha"})`, `Price (${units === "us" ? "crop-specific US units" : "USD/t"})`, `Total cost (${units === "us" ? "USD/ac" : "USD/ha"})`, `Gross revenue (${units === "us" ? "USD/ac" : "USD/ha"})`, `Net return (${units === "us" ? "USD/ac" : "USD/ha"})`, "Whole-field gross (USD)", "Whole-field net return (USD)"].map((title) => <th key={title} scope="col" className="px-2 py-2 font-medium">{title}</th>)}</tr></thead><tbody>{orderedRows.map((row, i) => { const crop = String(row.crop ?? ""); const perArea = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? `${fromCanonicalEconomicsValue("seedCost", raw, units, crop).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units === "us" ? "USD/ac" : "USD/ha"}` : "Unavailable"; const total = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? raw.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "Unavailable"; const ranked = rankedCrops.includes(crop); return <tr key={`${crop}-${i}`} className="border-b last:border-0"><th scope="row" className="px-2 py-2 font-medium">{crop || "Unknown"}{!ranked && <span className="block text-xs font-normal text-muted-foreground">Not ranked · {String(row.sourceRegion ?? "reference coverage unavailable")}</span>}</th><td className="px-2 py-2">{value(row.yieldTHa, "baselineYield", crop)}</td><td className="px-2 py-2">{value(row.priceUsdT, "grainPrice", crop)}</td><td className="px-2 py-2">{perArea(row.totalCostUsdHa)}</td><td className="px-2 py-2">{perArea(row.grossRevenueUsdHa)}</td><td className="px-2 py-2">{perArea(row.netReturnUsdHa)}</td><td className="px-2 py-2">{total(row.wholeFieldGrossRevenueUsd)}</td><td className="px-2 py-2">{total(row.wholeFieldNetReturnUsd)}</td></tr>; })}</tbody></table></div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Break-even values</summary><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">{rows.map((row, i) => <li key={`break-even-${i}`}>{String(row.crop)} · price {typeof row.breakEvenPriceUsdT === "number" ? `${row.breakEvenPriceUsdT.toFixed(2)} USD/t` : "unavailable"} · yield {typeof row.breakEvenYieldTHa === "number" ? `${row.breakEvenYieldTHa.toFixed(2)} t/ha` : "unavailable"}</li>)}</ul></details>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Sources, inputs, and assumptions</summary><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">{(Array.isArray(result.assumptions) ? result.assumptions : []).map((line, i) => <li key={i}>{String(line)}</li>)}{rows.map((row, i) => <li key={`source-${i}`}>{String(row.crop)} · {String(row.sourceRegion ?? "region unavailable")} · source year {String(row.sourceYear ?? "unavailable")} · {Array.isArray(row.inputBasis) ? row.inputBasis.join("; ") : "Input basis unavailable"} · {typeof row.provenance === "string" && /^https:\/\//.test(row.provenance) ? <a className="underline" href={row.provenance} target="_blank" rel="noreferrer">USDA ERS source</a> : "Source link unavailable"}</li>)}</ul></details>
    </section>;
  }
  if (name === "getCropReferences" && Array.isArray(result.rows)) {
    const rows = result.rows as Array<Record<string, unknown>>;
    const units = context.displayUnits ?? "metric";
    const val = (raw: unknown, key: "baselineYield" | "grainPrice" | "seedCost", crop: string) => typeof raw === "number" && Number.isFinite(raw) ? `${fromCanonicalEconomicsValue(key, raw, units, crop).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${economicsUnitLabel(key, units, crop)}` : "Unavailable";
    return <section className="mt-3 w-full rounded-lg border bg-card p-4 text-card-foreground"><h3 className="font-semibold">USDA ERS crop references</h3><p className="text-sm text-muted-foreground">Source year {String(result.referenceYear ?? "unavailable")} · {result.status === "stale_fallback" ? "previously verified fallback" : result.status === "available" ? "available" : "unavailable"}</p><details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Per-crop reference values</summary><div className="mt-2 max-w-full overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-2 py-2">Crop</th><th className="px-2 py-2">Yield</th><th className="px-2 py-2">Price</th><th className="px-2 py-2">Total production cost</th></tr></thead><tbody>{rows.map((row, i) => { const crop = String(row.crop ?? ""); return <tr className="border-b last:border-0" key={`${crop}-${i}`}><th scope="row" className="px-2 py-2 font-medium">{crop}</th><td className="px-2 py-2">{val(row.yieldTHa, "baselineYield", crop)}</td><td className="px-2 py-2">{val(row.priceUsdT, "grainPrice", crop)}</td><td className="px-2 py-2">{val(row.totalCostUsdHa, "seedCost", crop)}</td></tr>; })}</tbody></table></div></details><details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Source coverage and assumptions</summary><p className="mt-2 text-muted-foreground">{String(result.message ?? "")}</p><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">{(Array.isArray(result.assumptions) ? result.assumptions : []).map((line, i) => <li key={`a-${i}`}>{String(line)}</li>)}{(Array.isArray(result.provenance) ? result.provenance as Array<Record<string, unknown>> : []).map((source, i) => <li key={`s-${i}`}>{String(source.crop)} · retrieved {String(source.retrievedAt ?? "date unavailable")} · {typeof source.sourceUrl === "string" && /^https:\/\//.test(source.sourceUrl) ? <a className="underline" href={source.sourceUrl} target="_blank" rel="noreferrer">Source data</a> : "Source link unavailable"}</li>)}</ul></details></section>;
  }
  if (name === "getPredictionOptions") {
    const list = (key: string) => Array.isArray(result[key]) ? (result[key] as Array<{ label?: unknown; id?: unknown }>).map((entry) => String(entry.label ?? entry.id ?? "")).filter(Boolean) : [];
    const calendar = result.calendar as Record<string, unknown> | undefined;
    const months = (key: string) => Array.isArray(calendar?.[key]) ? (calendar[key] as number[]).join(", ") : "Unavailable";
    const notes = Array.isArray(result.notes) ? result.notes.map(String) : [];
    return <section className="mt-3 w-full rounded-lg border bg-card p-4 text-card-foreground"><h3 className="font-semibold">Supported reference options</h3><div className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><h4 className="font-medium">Sites</h4><p className="text-muted-foreground">{list("sites").join(", ") || "Unavailable"}</p></div><div><h4 className="font-medium">Cover crops</h4><p className="text-muted-foreground">{list("cover_crops").join(", ") || "Unavailable"}</p></div><div><h4 className="font-medium">Following crops</h4><p className="text-muted-foreground">{list("next_crops").join(", ") || "Unavailable"}</p></div></div><details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Reference calendar</summary><dl className="mt-2 grid grid-cols-2 gap-2"><dt>Cover planting months</dt><dd>{months("cover_planting_months")}</dd><dt>Cover termination months</dt><dd>{months("cover_termination_months")}</dd><dt>Wheat planting months</dt><dd>{months("wheat_planting_months")}</dd></dl></details>{notes.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}</section>;
  }
  if (name === "getFieldEvidence") {
    const conditions = result.conditions as { ok?: boolean; result?: Record<string, unknown>; error?: string } | undefined;
    const soil = result.soil as { ok?: boolean; result?: Record<string, unknown>; error?: string } | undefined;
    const measurements = conditions?.result as Record<string, { value?: number | null; unit?: string; status?: string; message?: string; source?: string; sourceUrl?: string; periodStart?: string | null; periodEnd?: string | null; spatialResolution?: string }> | undefined;
    const evidenceMeta = conditions?.result ? conditions.result as Record<string, unknown> : {};
    const soilResult = soil?.result as Record<string, unknown> | undefined;
    return <section className="mt-3 w-full rounded-lg border bg-card p-4 text-card-foreground"><h3 className="font-semibold">Selected field evidence</h3><p className="text-sm text-muted-foreground">{String(result.interpretation ?? "Point and grid evidence; not field-wide measurements.")}</p><dl className="mt-3 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-2 text-sm">{measurements && Object.entries(measurements).filter(([, value]) => value && typeof value === "object" && "status" in value).map(([key, measure]) => <Fragment key={key}><dt className="capitalize text-muted-foreground">{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</dt><dd>{measure.status === "available" && measure.value !== null ? `${measure.value} ${measure.unit ?? ""}` : measure.message ?? "Unavailable"}{measure.sourceUrl && /^https:\/\//.test(measure.sourceUrl) && <> · <a className="underline" href={measure.sourceUrl} target="_blank" rel="noreferrer">{measure.source ?? "Source"}</a></>}</dd></Fragment>)}</dl><details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Observation dates and coverage</summary><p className="mt-2 text-muted-foreground">Requested {String(evidenceMeta.requestedDate ?? "date unavailable")} · retrieved {String(evidenceMeta.retrievedAt ?? "date unavailable")}. {measurements ? Object.entries(measurements).filter(([, measure]) => measure && typeof measure === "object").map(([key, measure]) => `${key}: ${measure.periodStart ?? "period unavailable"}${measure.periodEnd ? ` to ${measure.periodEnd}` : ""} · ${measure.spatialResolution ?? "resolution unavailable"}`).join("; ") : "Observation coverage unavailable."}</p><p className="mt-2 text-muted-foreground">Soil profile: {soil?.ok ? String(soilResult?.message ?? "Mapped soil context available") : soil?.error ?? "Unavailable"}. Soil mapping is current survey context and does not measure field profile water.</p></details></section>;
  }
  if (name === "preparePlanDraft") {
    const proposal = result as unknown as MeridianPlanProposal;
    return <PlanProposalCard proposal={proposal} context={context} onApply={() => onApplyProposal(proposal)} />;
  }
  if (name === "rememberSeasonFacts") {
    const fact = result as unknown as MeridianSeasonFactsUpdate;
    return <RememberSeasonFact fact={fact} context={context} onSaved={() => onSeasonFactApplied(fact.planningYear)} />;
  }
  return <p className="mt-2 text-sm text-muted-foreground">{label} completed.</p>;
}

function RememberSeasonFact({ fact, context, onSaved }: { fact: MeridianSeasonFactsUpdate; context: MeridianChatContext; onSaved: () => void }) {
  const [state, setState] = useState<"saving" | "saved" | "session" | "stale">("saving");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const alreadySaved = readSeasonFacts().some((saved) => saved.fieldId === fact.fieldId && saved.planningYear === fact.planningYear && saved.sourceMessageId === fact.sourceMessageId && saved.contextVersion === fact.contextVersion);
    if (alreadySaved) {
      setState(seasonFactsStorageAvailable() ? "saved" : "session");
      return;
    }
    const current = !!context.fieldId && context.fieldId === fact.fieldId && context.contextVersion === fact.contextVersion;
    if (!current) { setState("stale"); return; }
    const stored = saveMeridianSeasonFacts(fact, context);
    setState(stored ? "saved" : !seasonFactsStorageAvailable() ? "session" : "stale");
    onSaved();
  }, [fact, context, onSaved]);
  if (state === "saving") return <p className="text-sm text-muted-foreground" role="status">Saving season fact…</p>;
  const wording = state === "saved" ? `Remembered ${fact.planningYear} irrigation status: ${fact.irrigation.status} on this device.` : state === "session" ? `Remembered ${fact.planningYear} irrigation status: ${fact.irrigation.status} for this session. Browser storage is unavailable.` : "Season fact not saved: the field or context changed. Ask Meridian to confirm it again.";
  return <p className={`text-sm ${state === "saved" ? "text-muted-foreground" : "text-destructive"}`} role="status">{wording}</p>;
}

function PlanProposalCard({ proposal, context, onApply }: { proposal: MeridianPlanProposal; context: MeridianChatContext; onApply: () => boolean }) {
  const [state, setState] = useState<"pending" | "applied" | "stale" | "failed" | "discarded">("pending");
  const pretty: Record<string, string> = { crop: "Cash crop", coverCrop: "Cover crop", cashCropPlantingDate: "Cash crop planting date", terminationDays: "Termination lead time (days)", areaHa: "Field area (ha)", notes: "Notes", grainPrice: "Grain price (USD/t)", baselineYield: "Baseline yield (t/ha)", yieldChange: "Assumed yield change (%)", seedCost: "Cover seed cost (USD/ha)", terminationCost: "Cover termination cost (USD/ha)", subsidy: "Incentive (USD/ha)" };
  const label = (key: string) => pretty[key] ?? key;
  const entries: Array<[string, unknown]> = Object.entries(proposal.changes).flatMap(([group, value]) => typeof value === "object" && value !== null ? Object.entries(value as Record<string, unknown>).map(([key, nested]) => [`${label(group)}: ${label(key)}`, nested] as [string, unknown]) : [[label(group), value] as [string, unknown]]);
  return <section className="mt-3 w-full rounded-lg border p-4" aria-label="Proposed plan draft"><p className="font-semibold">Proposed plan changes</p><dl className="mt-2 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">{entries.map(([key, value]) => <Fragment key={key}><dt className="text-muted-foreground">{key}</dt><dd className="break-words">{String(value)}</dd></Fragment>)}</dl>
    {state === "pending" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => setState(proposal.fieldId !== context.fieldId || proposal.contextVersion !== context.contextVersion ? "stale" : onApply() ? "applied" : "failed")}>Apply to plan draft</Button><Button size="sm" variant="outline" onClick={() => setState("discarded")}>Discard</Button></div> : <p className="mt-3 text-sm text-muted-foreground" role="status">{{ applied: "Applied to the editable plan draft. Review it in Field Planner before saving.", stale: "This proposal is out of date; ask Meridian to prepare it again.", failed: "This draft could not be applied. Check the proposed values and device storage, then ask Meridian to prepare it again.", discarded: "Proposal discarded." }[state]}</p>}
  </section>;
}

function MessageContent({ message, context, onApplyProposal, onSeasonFactApplied }: { message: UIMessage; context: MeridianChatContext; onApplyProposal: (proposal: MeridianPlanProposal) => boolean; onSeasonFactApplied: (year: number) => void }) {
  const parts = message.parts ?? [];
  return <div className="flex flex-col gap-2">
    {parts.map((part, index) => {
      if (part.type === "text") return message.role === "user" ? <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed">{part.text}</p> : <div key={`${message.id}-text-${index}`} className="max-w-none break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a> }}>{markdownWithoutRawHtml(part.text)}</ReactMarkdown></div>;
      if (part.type === "tool-runClovisComparison") return <ToolResult key={`${message.id}-tool-${index}`} part={part} context={context} onApplyProposal={onApplyProposal} />;
      if (part.type.startsWith("tool-")) return <MeridianToolResult key={`${message.id}-tool-${index}`} name={part.type.slice(5)} part={part} context={context} onApplyProposal={onApplyProposal} onSeasonFactApplied={onSeasonFactApplied} />;
      return null;
    })}
  </div>;
}

class MessageRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Meridian message rendering failed", { error: error.name }); }
  render() {
    return this.state.failed
      ? <p className="text-sm text-destructive" role="alert">This message could not be displayed safely. Ask Meridian to send it again.</p>
      : this.props.children;
  }
}

function ChatSession({ conversationKey, context, initial, initialStorageIssue, onApplyProposal, onSeasonFactApplied }: { conversationKey: string; context: IntelChatContext; initial: ReturnType<typeof getConversation>; initialStorageIssue?: string; onApplyProposal: (proposal: MeridianPlanProposal) => boolean; onSeasonFactApplied: (year: number) => void }) {
  const contextRef = useRef(context);
  contextRef.current = context;
  const contextVersionRef = useRef(context.contextVersion);
  const [contextChanged, setContextChanged] = useState(false);
  useEffect(() => { if (contextVersionRef.current && context.contextVersion !== contextVersionRef.current) setContextChanged(true); contextVersionRef.current = context.contextVersion; }, [context.contextVersion]);
  const [draft, setDraft] = useState("");
  const transport = useRef(new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts.flatMap((part) => part.type === "text" && part.text.trim() ? [{ type: "text" as const, text: part.text }] : []),
        })).filter((message) => message.parts.length > 0).slice(-40),
        context: contextRef.current,
      },
    }),
  }));
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    id: initial.id,
    messages: initial.messages,
    transport: transport.current,
  });
  const busy = status === "submitted" || status === "streaming";
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const [sendFailure, setSendFailure] = useState("");
  useEffect(() => () => { void stopRef.current(); }, []);
  const [storageWarning, setStorageWarning] = useState("");
  useEffect(() => { setStorageWarning(saveConversation(conversationKey, { id: initial.id, messages }) ? "" : "Chat history is available for this session but could not be saved on this device."); }, [conversationKey, initial.id, messages]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setSendFailure("");
    try { await sendMessage({ text }); }
    catch (sendError) { setSendFailure(friendlyError(sendError)); }
  };
  return <div className="flex min-h-0 flex-1 flex-col">
      <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
      <MessageScrollerViewport className="min-h-0 flex-1" aria-live="polite" aria-busy={busy} aria-label="Conversation">
      <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
        {contextChanged && <MessageScrollerItem><p className="text-center text-xs text-muted-foreground" role="status">Field context updated. Meridian will use the current field and plan details from here.</p></MessageScrollerItem>}
        {messages.length === 0 ? <MessageScrollerItem><div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center text-muted-foreground"><Sprout aria-hidden="true" /><p className="font-medium text-foreground">What would you like to understand about this field?</p><p className="text-sm">Ask a question in your own words. You can request a crop comparison in the conversation.</p></div></MessageScrollerItem> : messages.map((message) => <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
          <Message align={message.role === "user" ? "end" : "start"}><MessageRowContent><MessageHeader>{message.role === "user" ? "You" : "Meridian"}</MessageHeader><Bubble variant={message.role === "user" ? "default" : "muted"} align={message.role === "user" ? "end" : "start"}><BubbleContent><MessageRenderBoundary key={message.id}><MessageContent message={message} context={context} onApplyProposal={onApplyProposal} onSeasonFactApplied={onSeasonFactApplied} /></MessageRenderBoundary></BubbleContent></Bubble></MessageRowContent></Message>
        </MessageScrollerItem>)}
        {busy && <MessageScrollerItem><p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Meridian is working…</p></MessageScrollerItem>}
        {(error || sendFailure) && <MessageScrollerItem><div className="flex items-center gap-2 text-sm text-destructive" role="alert"><span>{sendFailure || friendlyError(error)}</span><Button variant="outline" size="sm" onClick={async () => { setSendFailure(""); try { await regenerate(); } catch (retryError) { setSendFailure(friendlyError(retryError)); } }}><RotateCcw data-icon="inline-start" />Retry</Button></div></MessageScrollerItem>}
        {initialStorageIssue && <MessageScrollerItem><p className="text-xs text-destructive" role="status">{initialStorageIssue}</p></MessageScrollerItem>}
        {storageWarning && <MessageScrollerItem><p className="text-xs text-destructive" role="status">{storageWarning}</p></MessageScrollerItem>}
      </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
      </MessageScroller>
      </MessageScrollerProvider>
      <form onSubmit={submit} className="shrink-0 border-t p-3 md:p-4">
        <FieldGroup className="mx-auto max-w-3xl gap-2">
          <Field>
            <FieldLabel htmlFor="intel-chat-composer" className="sr-only">Message Meridian</FieldLabel>
            <InputGroup>
              <InputGroupTextarea id="intel-chat-composer" value={draft} maxLength={4000} rows={2} className="max-h-40 min-h-12 resize-y" placeholder="Ask about this field or plan…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return; event.preventDefault(); event.currentTarget.form?.requestSubmit(); }} />
              <InputGroupButton type="submit" size="icon-sm" disabled={busy || !draft.trim()} aria-label="Send message"><ArrowUp /></InputGroupButton>
              {busy && <InputGroupButton type="button" variant="outline" size="icon-sm" onClick={() => void stop()} aria-label="Stop response"><Square /></InputGroupButton>}
            </InputGroup>
          </Field>
          <p className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
        </FieldGroup>
      </form>
    </div>;
}

export interface IntelChatActions { newChat: () => void; clearHistory: () => void }

export function IntelChat({ conversationKey, context, onApplyProposal = () => false, onSeasonFactApplied = () => undefined, onActions }: { conversationKey: string; context: IntelChatContext; onApplyProposal?: (proposal: MeridianPlanProposal) => boolean; onSeasonFactApplied?: (year: number) => void; onActions?: (actions?: IntelChatActions) => void }) {
  const [conversation, setConversation] = useState<ReturnType<typeof getConversation> | null>(null);
  const [historyIssue, setHistoryIssue] = useState<string>();
  useEffect(() => { setConversation(getConversation(conversationKey)); setHistoryIssue(getConversationIssue(conversationKey)); }, [conversationKey]);
  const newChat = () => { setConversation(startConversation(conversationKey)); setHistoryIssue(undefined); };
  const clearHistory = () => { setConversation(clearConversationHistory(conversationKey)); setHistoryIssue(undefined); };
  useEffect(() => {
    if (!conversation) return;
    onActions?.({ newChat, clearHistory });
    return () => onActions?.(undefined);
  }, [conversationKey, conversation?.id, onActions]);
  if (!conversation) return <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground" role="status">Opening conversation…</div>;
  return <ChatSession key={`${conversationKey}:${conversation.id}`} conversationKey={conversationKey} context={context} initial={conversation} initialStorageIssue={historyIssue} onApplyProposal={onApplyProposal} onSeasonFactApplied={onSeasonFactApplied} />;
}
