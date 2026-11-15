"use client";

import { useMeridian } from "@/components/workspace/MeridianProvider";
import { IntelChat } from "@/components/workspace/IntelChat";
import { coverCrops, contextKey, crops, locationLabel, today } from "@/lib/workspace";

export default function IntelWorkspace() {
  const { settings, savedPlan, activeField, planDraft } = useMeridian();
  const planMatchesSaved = !!savedPlan && !!planDraft &&
    ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].every((key) =>
      planDraft[key as keyof typeof planDraft] === savedPlan[key as keyof typeof savedPlan]);
  const hasWorkingPlanDraft = !!planDraft && !planMatchesSaved;
  const plan = hasWorkingPlanDraft ? planDraft : savedPlan;
  const crop = crops.find((item) => item.value === settings.crop)?.label ?? settings.crop;
  const context = {
    latitude: settings.selection.latitude,
    longitude: settings.selection.longitude,
    locationName: locationLabel(settings.selection),
    ...(activeField ? { fieldId: activeField.id } : {}),
    crop: settings.crop,
    observationDate: settings.timeMode === "latest" ? today() : settings.observationDate,
    ...(plan ? {
      plan: {
        coverCrop: coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop,
        terminationDays: plan.terminationDays,
        plantingDate: plan.plantingDate,
        areaHa: plan.areaHa,
        notes: plan.notes,
        status: hasWorkingPlanDraft ? "draft" as const : "saved" as const,
      },
    } : {}),
  };
  const conversationKey = contextKey(settings);

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 p-4 md:gap-5 md:p-6" aria-label="Meridian Intel">
      <header className="flex shrink-0 flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ask Meridian</h1>
        <p className="max-w-2xl text-muted-foreground">
          Ask about your field or compare a cover crop with fallow.
        </p>
      </header>
      <div className="flex shrink-0 flex-col gap-1">
        <h2 className="font-medium">{locationLabel(settings.selection)}</h2>
        <p className="text-sm text-muted-foreground">
          {crop} · {settings.timeMode === "latest" ? "Latest conditions" : settings.observationDate}
          {hasWorkingPlanDraft ? " · Draft plan" : savedPlan ? " · Saved plan" : " · No plan"}
        </p>
      </div>
      <IntelChat key={conversationKey} conversationKey={conversationKey} context={context} />
    </section>
  );
}
