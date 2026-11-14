"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, Info } from "lucide-react";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { coverCrops, crops, locationLabel } from "@/lib/workspace";
import { useFieldConditions } from "@/lib/fields/use-field-conditions";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { today } from "@/lib/workspace";
import { describeConditions } from "@/lib/intel-request";

export default function IntelWorkspace() {
  const {
    settings,
    status,
    savedPlan,
    activeField,
    boundaryArea,
    planDraft,
    question,
    setQuestion,
  } = useMeridian();
  const [feedback, setFeedback] = useState("");
  const [copiedRequest, setCopiedRequest] = useState(false);
  const conditionPoint = settings.selection.boundary
    ? analyzeBoundary(settings.selection.boundary)?.sample
    : { latitude: settings.selection.latitude, longitude: settings.selection.longitude };
  const conditionDate = settings.timeMode === "past" ? settings.observationDate : today();
  const { result: conditions, loading: conditionsLoading } = useFieldConditions(conditionPoint, conditionDate, true);
  const planMatchesSaved = !!savedPlan && !!planDraft &&
    ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].every((key) =>
      planDraft[key as keyof typeof planDraft] === savedPlan[key as keyof typeof savedPlan]);
  const hasWorkingPlanDraft = !!planDraft && !planMatchesSaved;
  const crop = crops.find((c) => c.value === settings.crop)?.label;
  const context = [
    `Location: ${locationLabel(settings.selection)}`,
    `Coordinates: ${settings.selection.latitude.toFixed(4)}, ${settings.selection.longitude.toFixed(4)}`,
    `Crop: ${crop}`,
    ...(activeField ? [`Saved field ID: ${activeField.id}`] : []),
    ...(boundaryArea !== undefined
      ? [`Calculated field boundary area: ${boundaryArea} ha`]
      : []),
    `Observation period: ${settings.timeMode === "latest" ? "Latest conditions" : `Past conditions (${settings.observationDate})`}`,
    `NASA layer: ${settings.overlay === "off" ? "None" : settings.overlay.toUpperCase()}`,
    ...(status.layer && !status.failed && !status.loading
      ? [`Actual observation: ${status.layer.date}`]
      : []),
    `Plan status: ${hasWorkingPlanDraft ? "working draft (unsaved changes may be present)" : savedPlan ? `saved plan recorded ${savedPlan.savedAt}` : "no plan"}`,
    ...(savedPlan && !hasWorkingPlanDraft
      ? [
          `Cover crop: ${coverCrops.find((c) => c.value === savedPlan.coverCrop)?.label}`,
          `Termination lead time: ${savedPlan.terminationDays} days before planting`,
          ...(savedPlan.areaHa
            ? [`Entered field area: ${savedPlan.areaHa} ha`]
            : []),
          ...(savedPlan.plantingDate
            ? [`Planned planting date: ${savedPlan.plantingDate}`]
            : []),
          `Saved plan notes: ${savedPlan.notes || "none"}`,
        ]
      : []),
    ...(hasWorkingPlanDraft ? [
      `Draft cover crop: ${coverCrops.find((c) => c.value === planDraft.coverCrop)?.label}`,
      `Draft termination lead time: ${planDraft.terminationDays} days before planting`,
      `Draft field area: ${planDraft.areaHa ? `${planDraft.areaHa} ha` : "not entered"}`,
      `Draft planting date: ${planDraft.plantingDate || "not entered"}`,
      `Draft notes: ${planDraft.notes || "none"}`,
    ] : []),
    describeConditions(conditions),
  ].join("\n");
  const request = `${context}\n\nQuestion: ${question.trim()}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request);
      setFeedback("Request copied");
      setCopiedRequest(true);
    } catch {
      setFeedback("Clipboard access was unavailable. Select the prepared request below to copy it.");
      setCopiedRequest(false);
    }
  };
  const suggest = (text: string) => {
    setQuestion(text);
    setFeedback("");
    setCopiedRequest(false);
  };
  const exportRequest = () => {
    const blob = new Blob([request], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "meridian-request.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Request exported");
  };
  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-5 md:p-10"
      aria-label="Meridian Intel"
    >
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Ask Meridian</h1>
        <p className="max-w-2xl text-muted-foreground">
          A question starts with a place. Bring your selected area, observations
          and field plan into the conversation.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{locationLabel(settings.selection)}</CardTitle>
          <CardDescription>
            {crop} ·{" "}
            {settings.timeMode === "latest"
              ? "Latest conditions"
              : settings.observationDate}
            {hasWorkingPlanDraft ? " · Working draft" : savedPlan ? " · Saved field plan" : " · No plan"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="intel-question">Your question</FieldLabel>
              <Textarea
                id="intel-question"
                value={question}
                maxLength={4000}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setFeedback("");
                  setCopiedRequest(false);
                }}
                placeholder="What should I review before planting here?"
                className="min-h-36"
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Start with a question
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  suggest(
                    "What does the selected NASA layer measure, and what are its limits?",
                  )
                }
              >
                Explain this observation
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  suggest(
                    "Which observations should I review alongside my cover-crop plan?",
                  )
                }
              >
                Review my field context
              </Button>
            </div>
          </div>
          <Separator />
          <Alert role="note">
            <Info aria-hidden="true" />
            <AlertTitle>Analysis is not connected yet</AlertTitle>
            <AlertDescription>
              {conditionsLoading ? "Field readings are loading. The prepared request marks them unavailable until verified." : "Prepare, copy, or export a request with verified numeric field conditions, their periods, sources, and missing-data states."}
              Meridian does not generate an assessment in this workspace yet.
            </AlertDescription>
          </Alert>
          <FieldGroup><Field><FieldLabel htmlFor="prepared-request">Prepared request</FieldLabel><Textarea id="prepared-request" readOnly value={request} className="min-h-52" onFocus={(e) => e.target.select()} /></Field></FieldGroup>
          {feedback && (
            <p className="text-sm text-muted-foreground" role="status">
              {feedback}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <Button
            variant="ghost"
            render={<Link href="/" />}
            nativeButton={false}
          >
            Back to Explore
            <ArrowUpRight data-icon="inline-end" />
          </Button>
          <Button disabled={!question.trim()} onClick={copy}>
            <Copy data-icon="inline-start" />
            {copiedRequest ? "Copied" : "Copy request"}
          </Button>
          <Button variant="outline" disabled={!question.trim()} onClick={exportRequest}>Export .txt</Button>
        </CardFooter>
      </Card>
    </section>
  );
}
