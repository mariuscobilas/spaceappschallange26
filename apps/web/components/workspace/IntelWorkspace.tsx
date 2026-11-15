"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { IntelChat, type IntelChatActions } from "@/components/workspace/IntelChat";
import { coverCrops, crops, locationLabel, today } from "@/lib/workspace";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { buildMeridianContext } from "@/lib/meridian/context";
import { useUnitSystem } from "@/hooks/use-unit-system";
import { readSeasonFacts, saveSeasonFact } from "@/lib/meridian/context";
import { formatArea } from "@/lib/units";

export default function IntelWorkspace() {
  const { settings, savedPlan, activeField, boundaryArea, planDraft, fields, chooseField, change, economicsDraft, savedPlans, applyChatProposal, fieldActionNotice, storageAvailable } = useMeridian();
  const [planningYear, setPlanningYear] = useState(() => Number((savedPlan?.plantingDate || settings.observationDate).slice(0, 4)));
  const [factsRevision, setFactsRevision] = useState(0);
  const [seasonStorageWarning, setSeasonStorageWarning] = useState(false);
  const [chatActions, setChatActions] = useState<IntelChatActions>();
  const registerChatActions = useCallback((actions?: IntelChatActions) => setChatActions(actions), []);
  const [displayUnits] = useUnitSystem();
  const fieldId = activeField?.id;
  useEffect(() => {
    const facts = fieldId ? readSeasonFacts().filter((fact) => fact.fieldId === fieldId) : [];
    const saved = facts.reduce<(typeof facts)[number] | undefined>((latest, fact) => !latest || fact.savedAt >= latest.savedAt ? fact : latest, undefined);
    let preferred: string | null = null;
    try { preferred = localStorage.getItem(`meridian.intel-planning-year.v1:${fieldId ?? "location"}`); } catch { setSeasonStorageWarning(true); }
    const legacyYear = Number(preferred);
    const validLegacyYear = Number.isInteger(legacyYear) && legacyYear >= 1900 && legacyYear <= 2200 ? legacyYear : undefined;
    setPlanningYear(saved?.planningYear ?? validLegacyYear ?? Number(savedPlan?.plantingDate?.slice(0, 4) || settings.observationDate.slice(0, 4)));
  }, [fieldId, savedPlan?.plantingDate, settings.observationDate]);
  const planMatchesSaved = !!savedPlan && !!planDraft &&
    ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].every((key) =>
      planDraft[key as keyof typeof planDraft] === savedPlan[key as keyof typeof savedPlan]);
  const hasWorkingPlanDraft = !!planDraft && !planMatchesSaved;
  const plan = hasWorkingPlanDraft ? planDraft : savedPlan;
  const budgetKeys = ["grainPrice", "baselineYield", "yieldChange", "seedCost", "terminationCost", "subsidy", "areaHa"] as const;
  const budgetHasValues = Object.values(economicsDraft).some(Boolean);
  const budgetMatchesSaved = !!savedPlan?.budget && budgetKeys.every((key) => (economicsDraft[key] ?? "") === (savedPlan.budget?.[key] ?? ""));
  const budgetState = savedPlan?.budget ? budgetMatchesSaved ? "saved" as const : "draft" as const : budgetHasValues ? "draft" as const : "none" as const;
  const crop = crops.find((item) => item.value === settings.crop)?.label ?? settings.crop;
  const context = buildMeridianContext({
    latitude: settings.selection.latitude,
    longitude: settings.selection.longitude,
    locationName: locationLabel(settings.selection),
    ...(activeField ? { fieldId: activeField.id } : {}),
    crop: settings.crop,
    observationDate: settings.timeMode === "latest" ? today() : settings.observationDate,
    ...(plan ? { plan: {
      coverCrop: coverCrops.find((item) => item.value === plan.coverCrop)?.label ?? plan.coverCrop,
      terminationDays: plan.terminationDays,
      plantingDate: plan.plantingDate,
      areaHa: plan.areaHa,
      notes: plan.notes,
      status: hasWorkingPlanDraft ? "draft" as const : "saved" as const,
      cashCropPlantingDate: plan.plantingDate,
      crop: settings.crop,
      ...(savedPlan?.budget ? { budget: { ...savedPlan.budget } } : {}),
    } } : {}),
    areaHa: boundaryArea ?? activeField?.areaHectares ?? (plan?.areaHa ? Number(plan.areaHa) : null),
    areaSource: boundaryArea ? "boundary" as const : activeField?.areaHectares ? "field" as const : plan?.areaHa ? "plan" as const : "unknown" as const,
    planningYear,
    displayUnits,
    activePlan: savedPlan ? { ...(savedPlan.id ? { id: savedPlan.id } : {}), ...(savedPlan.name ? { name: savedPlan.name } : {}), crop: savedPlan.crop, ...(savedPlan.budget ? { budget: { ...savedPlan.budget } } : {}) } : undefined,
    planStatus: hasWorkingPlanDraft || budgetState === "draft" ? "draft" : savedPlan ? "saved" : "none",
    budgetState,
    economicsDraft: { ...economicsDraft },
    savedAlternatives: savedPlans.filter(({ plan: item }) => activeField ? item.location.fieldId === activeField.id : item.location.fieldId === undefined && Math.abs(item.location.latitude - settings.selection.latitude) < 1e-5 && Math.abs(item.location.longitude - settings.selection.longitude) < 1e-5).slice(0, 50).map(({ plan: item }) => ({ ...(item.id ? { id: item.id } : {}), ...(item.name ? { name: item.name } : {}), crop: item.crop, coverCrop: item.coverCrop, terminationDays: item.terminationDays, cashCropPlantingDate: item.plantingDate, areaHa: item.areaHa, ...(item.budget ? { budget: { ...item.budget } } : {}) })),
    calendarStatus: plan?.plantingDate && plan.terminationDays >= 0 ? "complete" : "incomplete",
    budgetStatus: Object.values(economicsDraft).every(Boolean) ? "complete" : Object.values(economicsDraft).some(Boolean) ? "incomplete" : "unknown",
  });
  const fieldIdentity = activeField?.id ?? settings.selection.benchmarkId ?? settings.selection.hexId ?? `${settings.selection.latitude.toFixed(4)},${settings.selection.longitude.toFixed(4)}`;
  const conversationKey = `meridian-intel:${fieldIdentity}`;
  const actionError = fieldActionNotice && /(failed|could not|unavailable|not saved)/i.test(fieldActionNotice) ? fieldActionNotice : "";

  return <section className="flex h-full min-h-0 w-full flex-col" aria-label="Meridian Intel">
    <header data-facts-revision={factsRevision} className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:px-5">
      <SidebarTrigger aria-label="Toggle navigation" />
      <Separator orientation="vertical" className="my-2 h-6" />
      <h1 className="mr-2 text-sm font-semibold">Ask Meridian</h1>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!chatActions} onClick={() => chatActions?.newChat()} aria-label="Start a new chat"><Plus data-icon="inline-start" />New chat</Button>
        <Button variant="ghost" size="icon" disabled={!chatActions} onClick={() => chatActions?.clearHistory()} aria-label="Clear selected conversation history" title="Clear selected conversation history"><Trash2 /></Button>
      </div>
    </header>
    {(actionError || !storageAvailable) && <p className="shrink-0 border-b px-4 py-2 text-xs text-destructive" role="alert">{actionError || "Browser storage is unavailable. Recent workspace, chat, or season-context changes may last only for this session."}</p>}
    <IntelChat key={conversationKey} conversationKey={conversationKey} context={context} onActions={registerChatActions} onApplyProposal={(proposal) => applyChatProposal(proposal, context.contextVersion ?? "")} onSeasonFactApplied={(year) => { setPlanningYear(year); setFactsRevision((version) => version + 1); }} />
  </section>;
}
