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
  initialSettings,
  validMapSettings,
  validPlan,
} from "@/lib/workspace";
import type { EconomicsDraft, FieldPlan, SavedPlan } from "@/lib/workspace";
import { analyzeBoundary } from "@/lib/fields/geometry";
import {
  fieldSelection,
  normalizeField,
  validSavedField,
} from "@/lib/fields/storage";

const MAP_KEY = "meridian.map-settings.v3",
  FIELDS_KEY = "meridian.fields.v1",
  PLANS_KEY = "meridian.field-plans.v2",
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
  savePlan: (plan: FieldPlan) => boolean;
  economicsDraft: EconomicsDraft;
  updateEconomics: (draft: EconomicsDraft) => void;
  storageAvailable: boolean;
  question: string;
  setQuestion: (question: string) => void;
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
  deleteField: (id: string) => void;
  requestTransition: (action: () => void) => void;
  pendingAction: (() => void) | null;
  resolveTransition: (choice: "save" | "discard" | "stay") => void;
}
const MeridianContext = createContext<MeridianContextValue | null>(null);
export function MeridianProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [settings, setSettings] = useState(initialSettings);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>({}),
    [economics, setEconomics] = useState<Record<string, EconomicsDraft>>({});
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
  const [storageAvailable, setStorageAvailable] = useState(true),
    [question, setQuestion] = useState("");
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
    } catch {
      setStorageAvailable(false);
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
    } catch {}
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
            crop: active.currentCrop as PreviewCrop,
          };
        else if (restored.selection.fieldId)
          restored = { ...restored, selection: initialSettings.selection };
      }
    } catch {
      if (restored.selection.fieldId)
        restored = { ...restored, selection: initialSettings.selection };
    }
    setSettings(restored);
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
        } catch {}
      return merged;
    };
    setPlans(
      readRecords("meridian.field-plans.v1", PLANS_KEY, validPlan) as Record<
        string,
        SavedPlan
      >,
    );
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
    } catch {
      setStorageAvailable(false);
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
    setFields(next);
    setSettings((s) => ({
      ...s,
      selection: fieldSelection(normalized),
      crop: normalized.currentCrop as PreviewCrop,
    }));
    const nextPlans = { ...plans },
      nextEconomics = { ...economics };
    for (const crop of crops) {
      const old = `${legacyOrigin.current}|${crop.value}`,
        key = `${normalized.id}|${crop.value}`;
      if (!nextPlans[key] && plans[old])
        nextPlans[key] = {
          ...plans[old],
          location: fieldSelection(normalized),
        };
      if (!nextEconomics[key] && economics[old])
        nextEconomics[key] = { ...economics[old] };
      if (nextPlans[key])
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
    setPlans(nextPlans);
    setEconomics(nextEconomics);
    store(PLANS_KEY, nextPlans);
    store(ECONOMICS_KEY, nextEconomics);
    store(FIELDS_KEY, {
      version: 1,
      activeFieldId: normalized.id,
      fields: next,
    });
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
      setFieldDraft(null);
      resetDrawing();
      setSettings((s) => ({
        ...s,
        crop: field.currentCrop as PreviewCrop,
        selection: fieldSelection(field),
      }));
      navigateMap("selection");
    });
  const deleteField = (id: string) => {
    const next = fields.filter((f) => f.id !== id);
    setFields(next);
    const nextPlans = Object.fromEntries(
        Object.entries(plans).filter(([k]) => !k.startsWith(`${id}|`)),
      ),
      nextEconomics = Object.fromEntries(
        Object.entries(economics).filter(([k]) => !k.startsWith(`${id}|`)),
      );
    setPlans(nextPlans);
    setEconomics(nextEconomics);
    store(PLANS_KEY, nextPlans);
    store(ECONOMICS_KEY, nextEconomics);
    store(FIELDS_KEY, { version: 1, fields: next });
    setFieldDraft(null);
    markDirty(false);
    resetDrawing();
    setSettings((s) => ({ ...s, selection: initialSettings.selection }));
  };
  const key = contextKey(settings);
  const storedPlan = plans[key];
  const savedPlan =
    storedPlan && boundaryArea !== undefined
      ? { ...storedPlan, areaHa: String(boundaryArea) }
      : storedPlan;
  const savePlan = (draft: FieldPlan) => {
    const saved: SavedPlan = {
      ...draft,
      areaHa: boundaryArea !== undefined ? String(boundaryArea) : draft.areaHa,
      location: settings.selection,
      crop: settings.crop,
      savedAt: new Date().toISOString(),
    };
    if (!validPlan(saved)) return false;
    const next = { ...plans, [key]: saved };
    setPlans(next);
    return store(PLANS_KEY, next);
  };
  const economicsDraft = {
    ...(economics[key] ?? {
      ...emptyEconomics,
      areaHa:
        savedPlan?.areaHa ??
        (activeField?.areaHectares ? String(activeField.areaHectares) : ""),
    }),
    ...(boundaryArea !== undefined ? { areaHa: String(boundaryArea) } : {}),
  };
  const updateEconomics = (draft: EconomicsDraft) => {
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
        savePlan,
        economicsDraft,
        updateEconomics,
        storageAvailable,
        question,
        setQuestion,
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
