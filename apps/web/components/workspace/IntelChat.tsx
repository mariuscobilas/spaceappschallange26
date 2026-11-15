"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, LoaderCircle, RotateCcw, Square, Sprout, Plus } from "lucide-react";
import type { AnalyzeResult } from "@spaceapps/shared";
import type { MeridianChatContext } from "@spaceapps/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { getConversation, saveConversation, startConversation } from "@/components/workspace/intel-chat-session";

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

function ToolResult({ part }: { part: unknown }) {
  const item = part as { state?: string; output?: { ok?: boolean; result?: AnalyzeResult; error?: string }; errorText?: string };
  if (item.state === "input-streaming" || item.state === "input-available") return <p className="mt-2 text-sm text-muted-foreground">Running Clovis comparison…</p>;
  const output = item.output;
  if (item.state !== "output-available" || !output) return item.state === "output-error" ? <p className="mt-2 text-sm text-destructive">Comparison failed: {item.errorText ?? "Please retry."}</p> : null;
  return output.ok && output.result ? <ComparisonCard result={output.result} /> : <p className="mt-2 text-sm text-destructive">Comparison failed: {output.error ?? "Please retry."}</p>;
}

function MessageContent({ message }: { message: UIMessage }) {
  const parts = message.parts ?? [];
  return <div className="flex flex-col gap-2">
    {parts.map((part, index) => {
      if (part.type === "text") return <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap leading-relaxed">{part.text}</p>;
      if (part.type === "tool-runClovisComparison") return <ToolResult key={`${message.id}-tool-${index}`} part={part} />;
      return null;
    })}
  </div>;
}

function ChatSession({ conversationKey, context, initial, onNewChat }: { conversationKey: string; context: IntelChatContext; initial: ReturnType<typeof getConversation>; onNewChat: () => void }) {
  const contextRef = useRef(context);
  contextRef.current = context;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToLatest = useRef(true);
  const [sendFailure, setSendFailure] = useState("");
  useEffect(() => () => { void stopRef.current(); }, []);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && pinnedToLatest.current) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);
  useEffect(() => saveConversation(conversationKey, { id: initial.id, messages }), [conversationKey, initial.id, messages]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setSendFailure("");
    try { await sendMessage({ text }); }
    catch (sendError) { setSendFailure(friendlyError(sendError)); }
  };
  return <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
    <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-4 border-b py-3">
      <CardTitle className="text-base">Field conversation</CardTitle>
      <Button variant="outline" size="sm" onClick={() => { if (busy) void stop(); onNewChat(); }} aria-label="Start a new chat"><Plus data-icon="inline-start" />New chat</Button>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col p-0">
      <div ref={scrollRef} onScroll={(event) => { const node = event.currentTarget; pinnedToLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; }} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [overflow-wrap:anywhere] md:px-6" aria-live="polite" aria-busy={busy} aria-label="Conversation">
        {messages.length === 0 ? <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center text-muted-foreground"><Sprout aria-hidden="true" /><p className="font-medium text-foreground">What would you like to understand about this field?</p><p className="text-sm">Ask a question in your own words. You can request a Clovis cover crop comparison in the conversation.</p></div> : <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((message) => <div key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "Meridian"}</span>
            <div className={`max-w-full rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground" : "w-full bg-muted/60"}`}><MessageContent message={message} /></div>
          </div>)}
          {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Meridian is working…</p>}
          {(error || sendFailure) && <div className="flex items-center gap-2 text-sm text-destructive" role="alert"><span>{sendFailure || friendlyError(error)}</span><Button variant="outline" size="sm" onClick={async () => { setSendFailure(""); try { await regenerate(); } catch (retryError) { setSendFailure(friendlyError(retryError)); } }}><RotateCcw data-icon="inline-start" />Retry</Button></div>}
        </div>}
      </div>
      <form onSubmit={submit} className="shrink-0 border-t p-3 md:p-4">
        <FieldGroup className="mx-auto max-w-3xl gap-2">
          <Field>
            <FieldLabel htmlFor="intel-chat-composer" className="sr-only">Message Meridian</FieldLabel>
            <div className="flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
              <Textarea id="intel-chat-composer" value={draft} maxLength={4000} rows={2} className="max-h-40 min-h-12 resize-y border-0 shadow-none focus-visible:ring-0" placeholder="Ask about this field or plan…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return; event.preventDefault(); event.currentTarget.form?.requestSubmit(); }} />
              {busy ? <Button type="button" variant="outline" size="icon" onClick={() => void stop()} aria-label="Stop response"><Square /></Button> : <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message"><ArrowUp /></Button>}
            </div>
          </Field>
          <p className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
        </FieldGroup>
      </form>
    </CardContent>
  </Card>;
}

export function IntelChat({ conversationKey, context }: { conversationKey: string; context: IntelChatContext }) {
  const [conversation, setConversation] = useState(() => getConversation(conversationKey));
  useEffect(() => setConversation(getConversation(conversationKey)), [conversationKey]);
  const newChat = () => setConversation(startConversation(conversationKey));
  return <ChatSession key={`${conversationKey}:${conversation.id}`} conversationKey={conversationKey} context={context} initial={conversation} onNewChat={newChat} />;
}
