"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SavedField, GeoPolygon } from "@spaceapps/shared";
import type { MeridianPlanProposal } from "@spaceapps/shared";
import type {
  MapCanvasProps,
  MapSettings,
  MapStatus,
  Selection,
  PreviewCrop,
} from "@/lib/map/types";
import {
  contextKey,
  crops,
  emptyEconomics,
  emptyPlan,
  initialSettings,
  validMapSettings,
  validPlan,
  validPlanDraft,
  validBudget,
  planStorageKey,
  planContextKey,
} from "@/lib/workspace";
import type { EconomicsDraft, FieldPlan, SavedPlan } from "@/lib/workspace";
import { analyzeBoundary } from "@/lib/fields/geometry";
import { readSeasonFacts, seasonFactsStorageAvailable, prepareChatProposalDraft, replaceSeasonFactsMemory } from "@/lib/meridian/context";
import { BACKUP_KEYS, UNIT_KEY, type WorkspaceBackup } from "@/lib/workspace-backup";
import {
  fieldSelection,
  normalizeField,
  validSavedField,
} from "@/lib/fields/storage";

const MAP_KEY = "meridian.map-settings.v3",
  FIELDS_KEY = "meridian.fields.v1",
  PLANS_KEY = "meridian.field-plans.v2",
  PLAN_DRAFTS_KEY = "meridian.plan-drafts.v1",
  ECONOMICS_KEY = "meridian.economics.v2";
interface MeridianContextValue {
  ready: boolean;
  settings: MapSettings;
  change: <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => void;
  selectLocation: (selection: Selection, fly?: boolean) => void;
  navigation: MapCanvasProps["navigation"];
  navigateMap: (action: MapCanvasProps["navigation"]["action"]) => void;
  status: MapStatus;
  reportStatus: (status: MapStatus) => void;
  retry: number;
  retryImagery: () => void;
  savedPlan?: SavedPlan;
  planDraft?: FieldPlan;
  updatePlanDraft: (draft: FieldPlan) => void;
  applyChatProposal: (proposal: MeridianPlanProposal, currentContextVersion: string) => boolean;
  savePlan: (plan: FieldPlan, options?: { includeBudget?: boolean; asAlternative?: boolean; name?: string }) => boolean;
  hasPlanChanges: (plan: SavedPlan) => boolean;
  hasWorkingPlan: (fieldId: string, crop: PreviewCrop) => boolean;
  savedPlans: { key: string; plan: SavedPlan }[];
  getPlanDraft: (plan: SavedPlan) => FieldPlan | undefined;
  openSavedPlan: (key: string, restoreDraft?: boolean) => boolean;
  deleteSavedPlan: (key: string) => boolean;
  economicsDraft: EconomicsDraft;
  updateEconomics: (draft: EconomicsDraft) => void;
  storageAvailable: boolean;
  fieldActionNotice: string | null;
  dismissFieldNotice: () => void;
  getFieldDeletionImpact: (id: string) => { savedPlans: number; planDrafts: number; economicsInputs: number };
  fields: SavedField[];
  activeField?: SavedField;
  boundaryArea?: number;
  fieldDraft: SavedField | null;
  draftDirty: boolean;
  hasUnsavedChanges: () => boolean;
  drawing: NonNullable<MapCanvasProps["drawing"]>;
  beginField: (selection?: Selection, draw?: boolean) => void;
  editField: () => void;
  updateFieldDraft: (patch: Partial<SavedField>) => void;
  receiveBoundary: (boundary: GeoPolygon) => void;
  finishDrawing: () => void;
  saveField: () => boolean;
  cancelField: () => void;
  chooseField: (id: string) => void;
  deleteField: (id: string) => boolean;
  requestTransition: (action: () => void) => void;
  pendingAction: (() => void) | null;
  resolveTransition: (choice: "save" | "discard" | "stay") => void;
  createBackup: () => WorkspaceBackup;
  importBackup: (backup: WorkspaceBackup) => { imported: number; skipped: number } | null;
}
const MeridianContext = createContext<MeridianContextValue | null>(null);

function isMigratedPlanAlias(left: SavedPlan, right: SavedPlan, fields: SavedField[]) {
  const fieldPlan = left.location.fieldId ? left : right.location.fieldId ? right : undefined;
  const legacyPlan = fieldPlan === left ? right : fieldPlan === right ? left : undefined;
  if (!fieldPlan || !legacyPlan || legacyPlan.location.fieldId) return false;
  const field = fields.find((item) => item.id === fieldPlan.location.fieldId);
  if (!field?.benchmarkId || field.benchmarkId !== legacyPlan.location.benchmarkId) return false;
  if (Math.abs(field.location.latitude - legacyPlan.location.latitude) > 1e-6 ||
      Math.abs(field.location.longitude - legacyPlan.location.longitude) > 1e-6 ||
      fieldPlan.crop !== legacyPlan.crop || fieldPlan.savedAt !== legacyPlan.savedAt) return false;
  return ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].every((key) => fieldPlan[key as keyof SavedPlan] === legacyPlan[key as keyof SavedPlan]);
}

export function MeridianProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [settings, setSettings] = useState(initialSettings);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>({}),
    [economics, setEconomics] = useState<Record<string, EconomicsDraft>>({});
  const [openedPlanKey, setOpenedPlanKey] = useState("");
  const [openedPlans, setOpenedPlans] = useState<Record<string, string>>({});
  const [planDrafts, setPlanDrafts] = useState<Record<string, FieldPlan>>({});
  const [fields, setFields] = useState<SavedField[]>([]),
    [fieldDraft, setFieldDraft] = useState<SavedField | null>(null),
    [draftDirty, setDraftDirty] = useState(false);
  const [drawing, setDrawing] = useState<
    NonNullable<MapCanvasProps["drawing"]>
  >({ mode: "browse", session: 0, finish: 0 });
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const dirtyRef = useRef(false);
  const markDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDraftDirty(value);
  };
  const hasUnsavedChanges = useCallback(() => dirtyRef.current, []);
  const previousSelection = useRef<Selection>(initialSettings.selection),
    legacyOrigin = useRef("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [fieldActionNotice, setFieldActionNotice] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<MapCanvasProps["navigation"]>({
    action: "reset",
    nonce: 0,
  });
  const [retry, setRetry] = useState(0),
    [result, setResult] = useState<{ key: string; value: MapStatus }>();
  const requestKey = `${settings.overlay}|${settings.timeMode}|${settings.observationDate}`;
  const status =
    result?.key === requestKey
      ? result.value
      : { loading: true, failed: false, message: "Preparing map…" };
  const reportStatus = useCallback(
    (value: MapStatus) => setResult({ key: requestKey, value }),
    [requestKey],
  );
  const store = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      setStorageAvailable(false);
      console.warn(`Meridian browser storage write failed for ${key}`, error);
      return false;
    }
  };
  const writeTransaction = (writes: [string, string][]) => {
    const before: [string, string | null][] = [];
    try {
      for (const [key] of writes) before.push([key, localStorage.getItem(key)]);
      for (const [key, value] of writes) localStorage.setItem(key, value);
      return true;
    } catch (error) {
      let rollbackFailed = false;
      for (const [key, value] of before.reverse()) try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { rollbackFailed = true; }
      setStorageAvailable(false);
      setFieldActionNotice(rollbackFailed ? "Workspace changes failed, and browser storage could not fully restore its previous contents." : "Workspace changes failed; previous browser storage was restored.");
      console.error("Meridian workspace storage transaction failed", error);
      return false;
    }
  };
  useEffect(() => {
    let restored = initialSettings;
    try {
      const raw = localStorage.getItem(MAP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validMapSettings(parsed)) restored = parsed;
      } else
        for (const key of [
          "meridian.map-settings.v2",
          "meridian.map-settings.v1",
        ]) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const migrated = {
            ...initialSettings,
            ...JSON.parse(raw),
            timeMode: "latest",
            overlay: "off",
          };
          if (validMapSettings(migrated)) {
            restored = migrated;
            break;
          }
        }
    } catch (error) {
      setFieldActionNotice("Saved map settings could not be read; the default view is active.");
      console.warn("Meridian settings restore failed", error);
    }
    try {
      const raw = JSON.parse(localStorage.getItem(FIELDS_KEY) ?? "null");
      if (raw?.version === 1 && Array.isArray(raw.fields)) {
        const items: SavedField[] = raw.fields
          .filter(validSavedField)
          .map(normalizeField);
        setFields(items);
        const active = items.find((f) => f.id === raw.activeFieldId);
        if (active)
          restored = {
            ...restored,
            selection: fieldSelection(active),
            crop: (restored.selection.fieldId === active.id ? restored.crop : active.currentCrop) as PreviewCrop,
          };
        else if (restored.selection.fieldId)
          restored = { ...restored, selection: initialSettings.selection };
      }
    } catch (error) {
      if (restored.selection.fieldId)
        restored = { ...restored, selection: initialSettings.selection };
      setFieldActionNotice("Saved field data could not be read; it remains in browser storage for recovery.");
      console.warn("Meridian field storage restore failed", error);
    }
    setSettings(restored);
    try {
      setOpenedPlanKey(localStorage.getItem("meridian.open-plan.v1") ?? "");
      const refs = JSON.parse(localStorage.getItem("meridian.open-plans.v1") ?? "{}");
      if (refs && typeof refs === "object" && !Array.isArray(refs)) setOpenedPlans(Object.fromEntries(Object.entries(refs).filter(([, v]) => typeof v === "string")) as Record<string, string>);
    } catch (error) {
      setFieldActionNotice("Saved workspace references could not be read; existing plans remain available.");
      console.warn("Meridian open-plan reference restore failed", error);
    }
    const readRecords = (
      old: string,
      current: string,
      validate: (v: unknown) => boolean,
    ) => {
      const merged: Record<string, unknown> = {};
      for (const key of [old, current])
        try {
          const value = JSON.parse(localStorage.getItem(key) ?? "{}");
          if (value && typeof value === "object" && !Array.isArray(value))
            for (const [k, v] of Object.entries(value))
              if (validate(v)) merged[k] = v;
        } catch (error) {
          setFieldActionNotice("Some saved workspace data could not be read; stored records were left unchanged.");
          console.warn(`Meridian record restore failed for ${key}`, error);
        }
      return merged;
    };
    setPlans(
      readRecords("meridian.field-plans.v1", PLANS_KEY, validPlan) as Record<
        string,
        SavedPlan
      >,
    );
    setPlanDrafts(readRecords(PLAN_DRAFTS_KEY, PLAN_DRAFTS_KEY, validPlanDraft) as Record<string, FieldPlan>);
    setEconomics(
      readRecords(
        "meridian.economics.v1",
        ECONOMICS_KEY,
        (v) =>
          !!v &&
          typeof v === "object" &&
          Object.keys(emptyEconomics).every(
            (k) =>
              typeof (v as Record<string, unknown>)[k] === "string" &&
              (v as Record<string, string>)[k].length <= 40,
          ),
      ) as Record<string, EconomicsDraft>,
    );
    try {
      localStorage.setItem("meridian.storage-check", "1");
      localStorage.removeItem("meridian.storage-check");
    } catch (error) {
      setStorageAvailable(false);
      console.warn("Meridian browser storage availability check failed", error);
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("design")) {
      url.searchParams.delete("design");
      window.history.replaceState({}, "", url);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      store(MAP_KEY, settings);
      store(FIELDS_KEY, {
        version: 1,
        activeFieldId: fields.some((f) => f.id === settings.selection.fieldId)
          ? settings.selection.fieldId
          : previousSelection.current.fieldId,
        fields,
      });
    }
  }, [settings, fields, ready]);
  const activeField = fields.find((f) => f.id === settings.selection.fieldId);
  const boundaryArea = activeField?.boundary
    ? analyzeBoundary(activeField.boundary)?.areaHectares
    : undefined;
  const change = useCallback(
    <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      if (key === "crop")
        setFields((items) =>
          items.map((f) =>
            f.id === settings.selection.fieldId
              ? {
                  ...f,
                  currentCrop: value as PreviewCrop,
                  cropSource: "manual",
                  updatedAt: new Date().toISOString(),
                }
              : f,
          ),
        );
    },
    [settings.selection.fieldId],
  );
  const navigateMap = useCallback(
    (action: MapCanvasProps["navigation"]["action"]) =>
      setNavigation((n) => ({ action, nonce: n.nonce + 1 })),
    [],
  );
  const requestTransition = (action: () => void) => {
    if (dirtyRef.current) setPendingAction(() => action);
    else action();
  };
  const resetDrawing = () =>
    setDrawing((d) => ({
      mode: "browse",
      session: d.session + 1,
      finish: d.finish,
    }));
  const selectLocation = useCallback(
    (selection: Selection, fly = false) => {
      setSettings((s) => ({ ...s, selection }));
      if (fly) navigateMap("selection");
    },
    [navigateMap],
  );
  const beginField = (selection = settings.selection, draw = false) => {
    setFieldActionNotice(null);
    previousSelection.current = fieldDraft
      ? previousSelection.current
      : settings.selection;
    const existing = draw
      ? undefined
      : fields.find((f) => f.id === selection.fieldId);
    const baseSelection = { ...selection, fieldId: undefined };
    legacyOrigin.current = contextKey({ ...settings, selection: baseSelection })
      .split("|")
      .slice(0, -1)
      .join("|");
    const now = new Date().toISOString();
    const draft: SavedField = existing
      ? { ...existing }
      : {
          id: crypto.randomUUID(),
          name: draw
            ? "New field"
            : selection.name === "Selected point"
              ? "New field"
              : selection.name,
          location: {
            latitude: selection.latitude,
            longitude: selection.longitude,
          },
          currentCrop: settings.crop,
          cropSource: "manual",
          benchmarkId: selection.benchmarkId,
          createdAt: now,
          updatedAt: now,
        };
    if (draw) {
      delete draft.boundary;
      delete draft.areaHectares;
      delete draft.benchmarkId;
      legacyOrigin.current = "";
    }
    setFieldDraft(draft);
    markDirty(!existing || draw);
    setSettings((s) => ({ ...s, selection: fieldSelection(draft) }));
    setDrawing((d) => ({
      mode: draw ? "polygon" : "browse",
      session: d.session + 1,
      finish: d.finish,
      boundary: draft.boundary,
    }));
  };
  const updateFieldDraft = (patch: Partial<SavedField>) => {
    setFieldDraft((f) => (f ? { ...f, ...patch } : f));
    markDirty(true);
  };
  const receiveBoundary = (boundary: GeoPolygon) => {
    const info = analyzeBoundary(boundary);
    setFieldDraft((f) =>
      f
        ? {
            ...f,
            boundary,
            areaHectares: info?.areaHectares,
            location: info?.centroid ?? f.location,
          }
        : f,
    );
    setSettings((s) => ({
      ...s,
      selection: {
        ...s.selection,
        boundary,
        areaHectares: info?.areaHectares,
        ...(info?.centroid ?? {}),
      },
    }));
    markDirty(true);
    setDrawing((d) =>
      d.mode === "polygon"
        ? { ...d, mode: "browse", session: d.session + 1 }
        : d,
    );
  };
  const cancelField = () => {
    setFieldDraft(null);
    markDirty(false);
    setFieldActionNotice("Unsaved field changes were discarded.");
    setSettings((s) => ({ ...s, selection: previousSelection.current }));
    resetDrawing();
  };
  const saveField = () => {
    if (
      !fieldDraft ||
      ["polygon", "edit"].includes(drawing.mode) ||
      !validSavedField(fieldDraft)
    )
      return false;
    const normalized = normalizeField({
      ...fieldDraft,
      name: fieldDraft.name.trim(),
      updatedAt: new Date().toISOString(),
    });
    const next = fields.some((f) => f.id === normalized.id)
      ? fields.map((f) => (f.id === normalized.id ? normalized : f))
      : [...fields, normalized];
    const nextPlans = { ...plans },
      nextEconomics = { ...economics };
    const nextDrafts = { ...planDrafts };
    for (const crop of crops) {
      const old = `${legacyOrigin.current}|${crop.value}`,
        key = `${normalized.id}|${crop.value}`;
      if (!nextPlans[key] && plans[old])
        nextPlans[key] = {
          ...plans[old],
          location: fieldSelection(normalized),
        };
      // Keep the migration origin as an alias of the stable field ID. Its v2
      // record overrides v1 on restore, so renaming/re-saving cannot duplicate it.
      if (plans[old] && plans[old].snapshotVersion !== 1) nextPlans[old] = { ...plans[old], location: fieldSelection(normalized) };
      if (!nextEconomics[key] && economics[old])
        nextEconomics[key] = { ...economics[old] };
      if (!nextDrafts[key] && planDrafts[old])
        nextDrafts[key] = { ...planDrafts[old] };
      if (nextPlans[key] && nextPlans[key].snapshotVersion !== 1)
        nextPlans[key] = {
          ...nextPlans[key],
          location: fieldSelection(normalized),
          ...(normalized.boundary
            ? { areaHa: String(normalized.areaHectares) }
            : {}),
        };
      if (nextEconomics[key] && normalized.boundary)
        nextEconomics[key] = {
          ...nextEconomics[key],
          areaHa: String(normalized.areaHectares),
        };
    }
    const nextSettings = { ...settings, selection: fieldSelection(normalized), crop: normalized.currentCrop as PreviewCrop };
    if (!writeTransaction([
      [PLANS_KEY, JSON.stringify(nextPlans)], [ECONOMICS_KEY, JSON.stringify(nextEconomics)],
      [PLAN_DRAFTS_KEY, JSON.stringify(nextDrafts)], [MAP_KEY, JSON.stringify(nextSettings)],
      [FIELDS_KEY, JSON.stringify({
        version: 1,
        activeFieldId: normalized.id,
        fields: next,
      })],
    ])) return false;
    setFields(next); setSettings(nextSettings); setPlans(nextPlans); setEconomics(nextEconomics); setPlanDrafts(nextDrafts);
    setFieldActionNotice(`${normalized.name} saved on this device.`);
    previousSelection.current = fieldSelection(normalized);
    setFieldDraft(null);
    markDirty(false);
    resetDrawing();
    return true;
  };
  const resolveTransition = (choice: "save" | "discard" | "stay") => {
    const action = pendingAction;
    if (choice === "save" && !saveField()) return;
    if (choice === "discard") cancelField();
    setPendingAction(null);
    if (choice !== "stay") action?.();
  };
  const chooseField = (id: string) =>
    requestTransition(() => {
      const field = fields.find((f) => f.id === id);
      if (!field) return;
      setFieldActionNotice(null);
      setFieldDraft(null);
      resetDrawing();
      setSettings((s) => ({
        ...s,
        crop: field.currentCrop as PreviewCrop,
        selection: fieldSelection(field),
      }));
      navigateMap("selection");
    });
  const getFieldDeletionImpact = (id: string) => ({
    savedPlans: Object.keys(plans).filter((key) => key.startsWith(`${id}|`)).length,
    planDrafts: Object.keys(planDrafts).filter((key) => key.startsWith(`${id}|`)).length,
    economicsInputs: Object.keys(economics).filter((key) => key.startsWith(`${id}|`)).length,
  });
  const deleteField = (id: string) => {
    const field = fields.find((item) => item.id === id);
    if (!field || (draftDirty && fieldDraft?.id === id)) return false;
    const deletingActive = settings.selection.fieldId === id;
    const next = fields.filter((f) => f.id !== id);
    const nextPlans = Object.fromEntries(
        Object.entries(plans).filter(([k]) => !k.startsWith(`${id}|`)),
      ),
      nextEconomics = Object.fromEntries(
        Object.entries(economics).filter(([k]) => !k.startsWith(`${id}|`)),
      );
    const nextDrafts = Object.fromEntries(Object.entries(planDrafts).filter(([key]) => !key.startsWith(`${id}|`)));
    const remainingFacts = readSeasonFacts().filter((fact) => fact.fieldId !== id);
    const nextSettings = deletingActive ? { ...settings, selection: initialSettings.selection } : settings;
    if (!writeTransaction([
      [PLANS_KEY, JSON.stringify(nextPlans)], [ECONOMICS_KEY, JSON.stringify(nextEconomics)],
      [PLAN_DRAFTS_KEY, JSON.stringify(nextDrafts)], [MAP_KEY, JSON.stringify(nextSettings)],
      ["meridian.season-facts.v1", JSON.stringify(remainingFacts)],
      [FIELDS_KEY, JSON.stringify({
        version: 1,
        activeFieldId: deletingActive || !next.some((item) => item.id === settings.selection.fieldId)
          ? undefined
          : settings.selection.fieldId,
        fields: next,
      })],
    ])) return false;
    replaceSeasonFactsMemory(remainingFacts);
    setFields(next); setPlans(nextPlans); setEconomics(nextEconomics); setPlanDrafts(nextDrafts); setSettings(nextSettings);
    setFieldActionNotice(`${field.name} and its saved field data were deleted from this device.`);
    if (deletingActive) {
      setFieldDraft(null);
      markDirty(false);
      resetDrawing();
      previousSelection.current = initialSettings.selection;
    }
    return true;
  };
  const key = contextKey(settings);
  const openedKey = openedPlans[key] ?? openedPlanKey;
  const selectedPlanKey = plans[openedKey] && planContextKey(plans[openedKey]) === key ? openedKey : key;
  const savedPlan = plans[selectedPlanKey];
  const storedDraft = planDrafts[key];
  const planDraft = storedDraft && boundaryArea !== undefined
    ? { ...storedDraft, areaHa: String(boundaryArea) } : storedDraft;
  const updatePlanDraft = (draft: FieldPlan) => {
    const next = { ...planDrafts, [key]: {
      ...draft, ...(boundaryArea !== undefined ? { areaHa: String(boundaryArea) } : {}),
    } };
    setPlanDrafts(next);
    store(PLAN_DRAFTS_KEY, next);
  };
  const applyChatProposal = (proposal: MeridianPlanProposal, currentContextVersion: string) => {
    if (!proposal || proposal.fieldId !== settings.selection.fieldId || !proposal.fieldId || proposal.contextVersion !== currentContextVersion) return false;
    const changes = proposal.changes;
    const targetCrop = (changes.crop ?? settings.crop) as PreviewCrop;
    const targetKey = `${proposal.fieldId}|${targetCrop}`;
    const targetSaved = Object.values(plans).find((plan) => plan.location.fieldId === proposal.fieldId && plan.crop === targetCrop);
    const prepared = prepareChatProposalDraft({ proposal, fieldId: settings.selection.fieldId, contextVersion: currentContextVersion, currentCrop: settings.crop, baseDraft: planDrafts[targetKey] ?? targetSaved ?? (targetCrop === settings.crop ? storedDraft ?? savedPlan : undefined), baseEconomics: economics[targetKey], boundaryArea });
    if (!prepared) return false;
    const nextDrafts = { ...planDrafts, [targetKey]: prepared.draft };
    const nextEconomics = changes.budget || changes.areaHa !== undefined ? { ...economics, [targetKey]: prepared.economics } : economics;
    const writes: [string, string][] = [[PLAN_DRAFTS_KEY, JSON.stringify(nextDrafts)]];
    if (changes.budget || changes.areaHa !== undefined) writes.push([ECONOMICS_KEY, JSON.stringify(nextEconomics)]);
    const before: [string, string | null][] = [];
    try {
      for (const [storageKey] of writes) before.push([storageKey, localStorage.getItem(storageKey)]);
      for (const [storageKey, storageValue] of writes) localStorage.setItem(storageKey, storageValue);
    } catch (error) {
      let rollbackFailed = false;
      for (const [storageKey, previous] of before.reverse()) try { previous === null ? localStorage.removeItem(storageKey) : localStorage.setItem(storageKey, previous); } catch { rollbackFailed = true; }
      setStorageAvailable(false);
      setFieldActionNotice(rollbackFailed ? "The proposal could not be saved, and browser storage could not fully restore the previous draft." : "The proposal could not be saved; the previous draft was restored.");
      console.error("Meridian plan proposal storage transaction failed", error);
      return false;
    }
    setPlanDrafts(nextDrafts); setEconomics(nextEconomics);
    if (targetCrop !== settings.crop) setSettings((current) => ({ ...current, crop: targetCrop }));
    setFieldActionNotice("Proposal applied to the planner draft. Save the plan separately to keep it.");
    return true;
  };
  const savePlan = (draft: FieldPlan, options: { includeBudget?: boolean; asAlternative?: boolean; name?: string } = {}) => {
    const areaHa = boundaryArea !== undefined ? String(boundaryArea) : draft.areaHa;
    const budget = options.includeBudget ? { ...(economics[key] ?? savedPlan?.budget ?? emptyEconomics), areaHa } : undefined;
    if (budget && !validBudget(budget)) return false;
    const saved: SavedPlan = {
      coverCrop: draft.coverCrop, terminationDays: draft.terminationDays, plantingDate: draft.plantingDate, notes: draft.notes, areaHa, location: { ...settings.selection }, crop: settings.crop,
      savedAt: new Date().toISOString(), snapshotVersion: 1,
      ...(options.asAlternative ? { id: crypto.randomUUID() } : savedPlan?.id ? { id: savedPlan.id } : {}),
      ...(options.name?.trim() ? { name: options.name.trim() } : {}),
      ...(budget ? { budget: { ...budget } } : {}),
    };
    if (!validPlan(saved)) return false;
    const targetKey = planStorageKey(saved);
    const next = { ...plans, [targetKey]: saved };
    const nextDrafts = { ...planDrafts };
    delete nextDrafts[key];
    const refs = { ...openedPlans, [key]: targetKey };
    if (!writeTransaction([[PLANS_KEY, JSON.stringify(next)], [PLAN_DRAFTS_KEY, JSON.stringify(nextDrafts)], ["meridian.open-plans.v1", JSON.stringify(refs)], ["meridian.open-plan.v1", targetKey]])) return false;
    setPlans(next); setPlanDrafts(nextDrafts); setOpenedPlanKey(targetKey); setOpenedPlans(refs);
    return true;
  };
  const savedPlanGroups = new Map<string, { key: string; plan: SavedPlan }>();
  for (const [planKey, plan] of Object.entries(plans)) {
    const logicalKey = `${plan.location.fieldId ?? plan.location.benchmarkId ?? plan.location.hexId ?? `${plan.location.latitude.toFixed(4)},${plan.location.longitude.toFixed(4)}`}|${plan.crop}`;
    if (plan.id) { savedPlanGroups.set(planStorageKey(plan), { key: planKey, plan }); continue; }
    const alias = [...savedPlanGroups.entries()].find(([, existing]) => !existing.plan.id && isMigratedPlanAlias(existing.plan, plan, fields));
    if (alias) {
      if (plan.location.fieldId) savedPlanGroups.set(alias[0], { key: planKey, plan });
      continue;
    }
    const previous = savedPlanGroups.get(logicalKey);
    const isCanonical = planKey === logicalKey;
    const previousIsCanonical = previous?.key === logicalKey;
    if (!previous || (isCanonical && !previousIsCanonical) || (isCanonical === previousIsCanonical && plan.savedAt > previous.plan.savedAt))
      savedPlanGroups.set(logicalKey, { key: planKey, plan });
  }
  const savedPlans = [...savedPlanGroups.values()];
  savedPlans.sort((left, right) => right.plan.savedAt.localeCompare(left.plan.savedAt));
  const getPlanDraft = (plan: SavedPlan) => planDrafts[`${plan.location.fieldId ?? plan.location.benchmarkId ?? plan.location.hexId ?? `${plan.location.latitude.toFixed(4)},${plan.location.longitude.toFixed(4)}`}|${plan.crop}`];
  const openSavedPlan = (planKey: string, restoreDraft = false) => {
    const plan = plans[planKey];
    if (!plan) return false;
    const field = plan.location.fieldId ? fields.find((item) => item.id === plan.location.fieldId) : undefined;
    const selection = field ? fieldSelection(field) : plan.location;
    const crop = plan.crop;
    const nextFields = field
      ? fields.map((item) => item.id === field.id
        ? { ...item, currentCrop: crop, cropSource: "manual" as const, updatedAt: new Date().toISOString() }
        : item)
      : fields;
    const targetKey = `${selection.fieldId ?? selection.benchmarkId ?? selection.hexId ?? `${selection.latitude.toFixed(4)},${selection.longitude.toFixed(4)}`}|${crop}`;
    const calendar = { coverCrop: plan.coverCrop, terminationDays: plan.terminationDays, plantingDate: plan.plantingDate, areaHa: plan.areaHa, notes: plan.notes };
    let nextDrafts = planDrafts;
    let nextEconomics = economics;
    const writes: [string, string][] = [];
    if (restoreDraft || !planDrafts[targetKey]) {
      nextDrafts = { ...planDrafts, [targetKey]: calendar };
      writes.push([PLAN_DRAFTS_KEY, JSON.stringify(nextDrafts)]);
    }
    if (restoreDraft || !economics[targetKey]) {
      nextEconomics = { ...economics, [targetKey]: { ...(plan.budget ?? emptyEconomics), areaHa: plan.areaHa } };
      writes.push([ECONOMICS_KEY, JSON.stringify(nextEconomics)]);
    }
    const refs = { ...openedPlans, [targetKey]: planKey };
    const nextSettings = { ...settings, crop, selection };
    writes.push(["meridian.open-plans.v1", JSON.stringify(refs)], ["meridian.open-plan.v1", planKey], [MAP_KEY, JSON.stringify(nextSettings)], [FIELDS_KEY, JSON.stringify({ version: 1, activeFieldId: selection.fieldId, fields: nextFields })]);
    if (!writeTransaction(writes)) return false;
    if (field) setFields(nextFields);
    setPlanDrafts(nextDrafts); setEconomics(nextEconomics); setOpenedPlanKey(planKey); setOpenedPlans(refs); setSettings(nextSettings);
    setFieldDraft(null);
    markDirty(false);
    resetDrawing();
    return true;
  };
  const deleteSavedPlan = (planKey: string) => {
    if (!plans[planKey]) return true;
    const next = { ...plans };
    const selected = plans[planKey];
    const logicalKey = `${selected.location.fieldId ?? selected.location.benchmarkId ?? selected.location.hexId ?? `${selected.location.latitude.toFixed(4)},${selected.location.longitude.toFixed(4)}`}|${selected.crop}`;
    const deleted = new Set<string>();
    for (const [candidateKey, plan] of Object.entries(next)) {
      const candidateLogicalKey = `${plan.location.fieldId ?? plan.location.benchmarkId ?? plan.location.hexId ?? `${plan.location.latitude.toFixed(4)},${plan.location.longitude.toFixed(4)}`}|${plan.crop}`;
      if (candidateKey === planKey || (!selected.id && !plan.id && (candidateLogicalKey === logicalKey || isMigratedPlanAlias(selected, plan, fields)))) {
        delete next[candidateKey];
        deleted.add(candidateKey);
      }
    }
    let legacy: Record<string, unknown> = {};
    try {
      const value: unknown = JSON.parse(localStorage.getItem("meridian.field-plans.v1") ?? "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("legacy saved plans are not an object");
      legacy = value as Record<string, unknown>;
    } catch (error) {
      setStorageAvailable(false);
      setFieldActionNotice("The legacy saved plans could not be read, so this plan was not deleted.");
      console.warn("Meridian legacy plan deletion preparation failed", error);
      return false;
    }
    for (const key of deleted) delete legacy[key];
    if (!writeTransaction([[PLANS_KEY, JSON.stringify(next)], ["meridian.field-plans.v1", JSON.stringify(legacy)]])) return false;
    setPlans(next);
    return true;
  };
  const economicsDraft: EconomicsDraft = {
    ...(economics[key] ?? savedPlan?.budget ?? emptyEconomics),
    areaHa: boundaryArea !== undefined ? String(boundaryArea)
      : storedDraft?.areaHa ?? savedPlan?.areaHa ?? economics[key]?.areaHa
        ?? (activeField?.areaHectares ? String(activeField.areaHectares) : ""),
  };
  const hasWorkingPlan = (fieldId: string, crop: PreviewCrop) => !!planDrafts[`${fieldId}|${crop}`] || Object.entries(economics[`${fieldId}|${crop}`] ?? {}).some(([k, v]) => k !== "areaHa" && v !== "");
  const hasPlanChanges = (plan: SavedPlan) => {
    const context = planContextKey(plan);
    const draft = planDrafts[context];
    const calendarChanged = draft && ["coverCrop", "terminationDays", "plantingDate", "areaHa", "notes"].some(k => draft[k as keyof FieldPlan] !== plan[k as keyof FieldPlan]);
    const budget = economics[context];
    const budgetChanged = budget && Object.keys(emptyEconomics).some(k => {
      if (k === "areaHa") return false;
      return budget[k as keyof EconomicsDraft] !== (plan.budget?.[k as keyof EconomicsDraft] ?? "");
    });
    const field = fields.find(f => f.id === plan.location.fieldId);
    const areaChanged = !!field?.boundary && Number(plan.areaHa) !== Number(field.areaHectares);
    return !!calendarChanged || !!budgetChanged || areaChanged;
  };
  const updateEconomics = (draft: EconomicsDraft) => {
    // Calendar and budget share one managed field area, in canonical hectares.
    const areaHa = boundaryArea !== undefined ? String(boundaryArea) : draft.areaHa;
    if ((storedDraft?.areaHa ?? savedPlan?.areaHa ?? "") !== areaHa) {
      const nextDrafts = { ...planDrafts, [key]: { ...(storedDraft ?? savedPlan ?? emptyPlan), areaHa } };
      setPlanDrafts(nextDrafts);
      store(PLAN_DRAFTS_KEY, nextDrafts);
    }
    const next = {
      ...economics,
      [key]: {
        ...draft,
        ...(boundaryArea !== undefined ? { areaHa: String(boundaryArea) } : {}),
      },
    };
    setEconomics(next);
    store(ECONOMICS_KEY, next);
  };
  const editField = () => {
    setFieldActionNotice(null);
    if (!fieldDraft && activeField) {
      previousSelection.current = settings.selection;
      setFieldDraft({ ...activeField });
      markDirty(false);
    }
    setDrawing((d) => ({
      mode: "edit",
      boundary: fieldDraft?.boundary ?? activeField?.boundary,
      session: d.session + 1,
      finish: d.finish,
    }));
  };
  const createBackup = (): WorkspaceBackup => {
    let unitSystem: "metric" | "us" = "metric";
    try { unitSystem = localStorage.getItem(UNIT_KEY) === "us" ? "us" : "metric"; } catch (error) {
      console.warn("Meridian unit preference restore failed; metric units are used for this export", error);
    }
    return {
      version: 1, exportedAt: new Date().toISOString(), settings, fields,
      // Storage can retain a benchmark-keyed migration alias whose plan payload
      // now points at the canonical field ID. Export only the canonical plan
      // groups exposed to users so every emitted key matches its payload.
      activeFieldId: settings.selection.fieldId,
      plans: Object.fromEntries(savedPlans.map(({ plan }) => [
        planStorageKey(plan),
        plan,
      ])),
      drafts: planDrafts, economics, unitSystem, seasonFacts: readSeasonFacts(),
    };
  };
  const importBackup = (backup: WorkspaceBackup) => {
    if (dirtyRef.current) return null;
    const existingIds = new Set(fields.map((field) => field.id));
    const newFields = backup.fields.filter((field) => !existingIds.has(field.id)).map(normalizeField);
    const mergedFields = [...fields, ...newFields];
    const validRef = (plan: SavedPlan) => !plan.location.fieldId || mergedFields.some((field) => field.id === plan.location.fieldId);
    const additions = <T,>(current: Record<string, T>, incoming: Record<string, T>, valid: (item: T) => boolean = () => true) => {
      const next = { ...current };
      let added = 0, skipped = 0;
      for (const [key, item] of Object.entries(incoming)) {
        if (Object.prototype.hasOwnProperty.call(next, key) || !valid(item)) skipped++;
        else { next[key] = item; added++; }
      }
      return { next, added, skipped };
    };
    const planResult = additions(plans, backup.plans, validRef);
    const draftResult = additions(planDrafts, backup.drafts);
    const economicsResult = additions(economics, backup.economics);
    const facts = readSeasonFacts();
    const incomingFacts = (backup.seasonFacts ?? []).filter((fact) => mergedFields.some((field) => field.id === fact.fieldId));
    const mergedFacts = [...facts];
    let factsAdded = 0, factsSkipped = (backup.seasonFacts?.length ?? 0) - incomingFacts.length;
    for (const fact of incomingFacts) {
      if (mergedFacts.some((old) => old.fieldId === fact.fieldId && old.planningYear === fact.planningYear && old.sourceMessageId === fact.sourceMessageId)) factsSkipped++;
      else { mergedFacts.push(fact); factsAdded++; }
    }
    const selectedId = backup.settings.selection.fieldId ?? backup.activeFieldId;
    const active = selectedId && mergedFields.some((field) => field.id === selectedId)
      ? mergedFields.find((field) => field.id === selectedId) : undefined;
    const nextSettings = active
      ? { ...backup.settings, selection: fieldSelection(active) }
      : backup.settings.selection.fieldId && !mergedFields.some((field) => field.id === backup.settings.selection.fieldId)
        ? { ...backup.settings, selection: initialSettings.selection } : backup.settings;
    const writes: [string, string][] = [
      [BACKUP_KEYS.settings, JSON.stringify(nextSettings)],
      [BACKUP_KEYS.fields, JSON.stringify({ version: 1, activeFieldId: active?.id, fields: mergedFields })],
      [BACKUP_KEYS.plans, JSON.stringify(planResult.next)], [BACKUP_KEYS.drafts, JSON.stringify(draftResult.next)],
      [BACKUP_KEYS.economics, JSON.stringify(economicsResult.next)], [UNIT_KEY, backup.unitSystem],
      ["meridian.season-facts.v1", JSON.stringify(mergedFacts)],
    ];
    let before: readonly (readonly [string, string | null])[] = [];
    try {
      before = writes.map(([key]) => [key, localStorage.getItem(key)] as const);
      for (const [key, value] of writes) localStorage.setItem(key, value);
    } catch (error) {
      let rollbackFailed = false;
      for (const [key, value] of before) try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { rollbackFailed = true; }
      setStorageAvailable(false);
      setFieldActionNotice(rollbackFailed ? "Backup import failed, and browser storage could not fully restore its previous contents." : "Backup import failed; previous browser storage was restored.");
      console.error("Meridian backup import transaction failed", error);
      return null;
    }
    setSettings(nextSettings); setFields(mergedFields); setPlans(planResult.next);
    setPlanDrafts(draftResult.next); setEconomics(economicsResult.next);
    replaceSeasonFactsMemory(mergedFacts);
    previousSelection.current = nextSettings.selection;
    window.dispatchEvent(new CustomEvent("meridian:unit-system-change", { detail: backup.unitSystem }));
    return { imported: newFields.length + planResult.added + draftResult.added + economicsResult.added + factsAdded, skipped: (backup.fields.length - newFields.length) + planResult.skipped + draftResult.skipped + economicsResult.skipped + factsSkipped };
  };
  return (
    <MeridianContext.Provider
      value={{
        ready,
        settings,
        change,
        selectLocation,
        navigation,
        navigateMap,
        status,
        reportStatus,
        retry,
        retryImagery: () => setRetry((r) => r + 1),
        savedPlan,
        planDraft,
        updatePlanDraft,
        applyChatProposal,
        savePlan,
        savedPlans,
        hasPlanChanges,
        hasWorkingPlan,
        getPlanDraft,
        openSavedPlan,
        deleteSavedPlan,
        economicsDraft,
        updateEconomics,
        storageAvailable: storageAvailable && seasonFactsStorageAvailable(),
        fieldActionNotice,
        dismissFieldNotice: () => setFieldActionNotice(null),
        getFieldDeletionImpact,
        fields,
        activeField,
        boundaryArea,
        fieldDraft,
        draftDirty,
        hasUnsavedChanges,
        drawing,
        beginField,
        editField,
        updateFieldDraft,
        receiveBoundary,
        finishDrawing: () =>
          setDrawing((d) =>
            d.mode === "edit"
              ? { ...d, mode: "browse", session: d.session + 1 }
              : { ...d, finish: d.finish + 1 },
          ),
        saveField,
        cancelField,
        chooseField,
        deleteField,
        requestTransition,
        pendingAction,
        resolveTransition,
        createBackup,
        importBackup,
      }}
    >
      {children}
    </MeridianContext.Provider>
  );
}
export function useMeridian() {
  const value = useContext(MeridianContext);
  if (!value) throw new Error("Meridian workspace requires its provider");
  return value;
}
