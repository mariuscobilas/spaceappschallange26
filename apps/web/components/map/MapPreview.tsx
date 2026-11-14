"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Layers3,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Satellite,
  Wheat,
  X,
} from "lucide-react";
import { cellArea, isValidCell } from "h3-js";
import farms from "@/data/benchmark_farms.json";
import type {
  MapCanvasProps,
  MapSettings,
  MapStatus,
  Overlay,
  PreviewCrop,
  Selection,
} from "@/lib/map/types";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <span className="loader-dot" />
      Preparing map layers…
    </div>
  ),
});
const STORAGE_KEY = "meridian.map-settings.v3";
const LEGACY_KEYS = ["meridian.map-settings.v2", "meridian.map-settings.v1"];
const initialFarm = farms.find((farm) => farm.id === "tribune") ?? farms[0];
const today = () => new Date().toISOString().slice(0, 10);
const defaults: MapSettings = {
  mode: "field",
  crop: "wheat",
  timeMode: "latest",
  observationDate: today(),
  overlay: "off",
  opacity: 0.55,
  selection: {
    latitude: initialFarm.latitude,
    longitude: initialFarm.longitude,
    name: initialFarm.name,
    benchmarkId: initialFarm.id,
  },
};
const crops: { value: PreviewCrop; label: string }[] = [
  { value: "wheat", label: "Wheat" },
  { value: "corn", label: "Corn" },
  { value: "soybeans", label: "Soybeans" },
  { value: "cotton", label: "Cotton" },
  { value: "sorghum", label: "Sorghum" },
];
const layers: { value: Overlay; label: string; short: string }[] = [
  { value: "smap", label: "Soil moisture · SMAP", short: "SMAP" },
  { value: "ndvi", label: "Vegetation · NDVI", short: "NDVI" },
  { value: "imerg", label: "Precipitation · IMERG", short: "IMERG" },
  { value: "off", label: "No overlay", short: "Off" },
];
function validSettings(value: unknown): value is MapSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<MapSettings>;
  const date = v.observationDate;
  const parsedDate =
    typeof date === "string" ? new Date(`${date}T00:00:00Z`) : null;
  return (
    (v.mode === "field" || v.mode === "atlas") &&
    crops.some((c) => c.value === v.crop) &&
    (v.timeMode === "latest" || v.timeMode === "past") &&
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    parsedDate !== null &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date &&
    date <= today() &&
    layers.some((l) => l.value === v.overlay) &&
    typeof v.opacity === "number" &&
    Number.isFinite(v.opacity) &&
    v.opacity >= 0 &&
    v.opacity <= 1 &&
    !!v.selection &&
    typeof v.selection.latitude === "number" &&
    Number.isFinite(v.selection.latitude) &&
    Math.abs(v.selection.latitude) <= 90 &&
    typeof v.selection.longitude === "number" &&
    Number.isFinite(v.selection.longitude) &&
    Math.abs(v.selection.longitude) <= 180 &&
    typeof v.selection.name === "string" &&
    (v.selection.hexId === undefined ||
      (typeof v.selection.hexId === "string" &&
        isValidCell(v.selection.hexId))) &&
    (v.selection.benchmarkId === undefined ||
      farms.some((farm) => farm.id === v.selection?.benchmarkId))
  );
}
function clearPreviewQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("design")) return;
  url.searchParams.delete("design");
  window.history.replaceState({}, "", url);
}

export default function MapPreview() {
  const [settings, setSettings] = useState<MapSettings>(defaults);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<MapStatus>({
    loading: true,
    message: "Connecting to map layers",
    failed: false,
  });
  const [navigation, setNavigation] = useState<MapCanvasProps["navigation"]>({
    action: "reset",
    nonce: 0,
  });
  const [retry, setRetry] = useState(0);
  const [layerOpen, setLayerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (validSettings(parsed)) setSettings(parsed);
      } else {
        for (const key of LEGACY_KEYS) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as Partial<MapSettings>;
          if (
            parsed &&
            typeof parsed === "object" &&
            crops.some((crop) => crop.value === parsed.crop) &&
            (parsed.mode === "field" || parsed.mode === "atlas") &&
            typeof parsed.opacity === "number" &&
            parsed.opacity >= 0 &&
            parsed.opacity <= 1 &&
            layers.some((layer) => layer.value === parsed.overlay) &&
            validSettings({
              ...defaults,
              ...parsed,
              timeMode: "latest",
              observationDate: today(),
              overlay: "off",
            })
          ) {
            setSettings({
              ...defaults,
              ...parsed,
              timeMode: "latest",
              observationDate: today(),
              overlay: "off",
            });
            break;
          }
        }
      }
    } catch {
      /* Continue with defaults when local storage is unavailable. */
    }
    setPanelOpen(window.matchMedia("(min-width: 641px)").matches);
    clearPreviewQuery();
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* Storage is optional. */
      }
    }
  }, [ready, settings]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (layerOpen) setLayerOpen(false);
        else if (intelOpen) setIntelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layerOpen, intelOpen]);
  const change = useCallback(
    <K extends keyof MapSettings>(key: K, value: MapSettings[K]) =>
      setSettings((previous) => ({ ...previous, [key]: value })),
    [],
  );
  const chooseFarm = useCallback(
    (id: string) => {
      const farm = farms.find((entry) => entry.id === id);
      if (!farm) return;
      change("selection", {
        latitude: farm.latitude,
        longitude: farm.longitude,
        name: farm.name,
        benchmarkId: farm.id,
      });
      setNavigation((n) => ({ action: "selection", nonce: n.nonce + 1 }));
    },
    [change],
  );
  const select = useCallback(
    (selection: Selection) => {
      change("selection", selection);
      setPanelOpen(true);
      setIntelOpen(false);
    },
    [change],
  );
  const onStatus = useCallback((next: MapStatus) => setStatus(next), []);
  const navigationAction = useCallback(
    (action: MapCanvasProps["navigation"]["action"]) =>
      setNavigation((n) => ({ action, nonce: n.nonce + 1 })),
    [],
  );
  const selectedCrop = useMemo(
    () => crops.find((crop) => crop.value === settings.crop)?.label ?? "Wheat",
    [settings.crop],
  );
  const selectedLayer =
    layers.find((layer) => layer.value === settings.overlay)?.short ?? "Off";
  const coords = `${Math.abs(settings.selection.latitude).toFixed(4)}° ${settings.selection.latitude < 0 ? "S" : "N"} · ${Math.abs(settings.selection.longitude).toFixed(4)}° ${settings.selection.longitude < 0 ? "W" : "E"}`;
  const area = settings.selection.hexId
    ? `${cellArea(settings.selection.hexId, "km2").toFixed(2)} km²`
    : null;
  const contextText = `Location: ${settings.selection.name}${settings.selection.benchmarkId ? ", Kansas" : ""}\nCoordinates: ${coords}\n${area ? `Regional cell: ${area}\n` : ""}Crop: ${selectedCrop}\nObservation period: ${settings.timeMode === "latest" ? "Latest conditions" : `Past conditions (${settings.observationDate})`}\nNASA layer: ${settings.overlay === "off" ? "None" : settings.overlay.toUpperCase()}`;
  const copyRequest = async () => {
    const request = `${contextText}\n\nQuestion: ${question.trim() || "(add a question)"}`;
    try {
      await navigator.clipboard.writeText(request);
      setCopyFeedback("Request copied");
    } catch {
      setCopyFeedback("Clipboard unavailable");
    }
    window.setTimeout(() => setCopyFeedback(""), 2200);
  };

  if (!ready)
    return (
      <main className="app-shell boot-shell" aria-label="Loading Meridian">
        <div className="boot-mark">M</div>
        <span>Opening field intelligence</span>
      </main>
    );
  return (
    <main className="app-shell map-preview">
      <section
        id="map"
        className="map-stage"
        aria-label="Interactive field map"
      >
        <MapCanvas
          {...settings}
          onSelect={select}
          onStatus={onStatus}
          navigation={navigation}
          retry={retry}
        />
      </section>
      <header className="command-bar">
        <a className="brand-lockup" href="#map" aria-label="Meridian">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36">
              <path d="M18 3.5 31 11v14L18 32.5 5 25V11z" />
              <path d="M18 3.5v29M5 11l26 14M31 11 5 25" />
              <circle cx="18" cy="18" r="4.2" />
            </svg>
          </span>
          <strong>Meridian</strong>
        </a>
        <nav className="mode-switch" aria-label="Map mode">
          <button
            aria-label="Field Simulator"
            onClick={() => change("mode", "field")}
            className={settings.mode === "field" ? "selected" : ""}
            aria-pressed={settings.mode === "field"}
          >
            Field Simulator
          </button>
          <button
            aria-label="National Risk Atlas"
            onClick={() => change("mode", "atlas")}
            className={settings.mode === "atlas" ? "selected" : ""}
            aria-pressed={settings.mode === "atlas"}
          >
            National Risk Atlas
          </button>
        </nav>
        <label className="header-control crop-control">
          <Wheat size={17} aria-hidden="true" />
          <span>{selectedCrop}</span>
          <ChevronDown size={15} aria-hidden="true" />
          <select
            aria-label="Cash crop"
            value={settings.crop}
            onChange={(event) =>
              change("crop", event.target.value as PreviewCrop)
            }
          >
            {crops.map((crop) => (
              <option key={crop.value} value={crop.value}>
                {crop.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`header-control layers-trigger ${layerOpen ? "open" : ""}`}
          onClick={() => setLayerOpen((open) => !open)}
          aria-expanded={layerOpen}
          aria-label="Layers"
        >
          <Layers3 size={17} />
          <span>Layers</span>
          <b>{selectedLayer}</b>
          <ChevronDown size={14} />
        </button>
        <label className="period-control">
          <span>Observation period</span>
          <select
            aria-label="Observation period"
            value={settings.timeMode}
            onChange={(event) =>
              change("timeMode", event.target.value as MapSettings["timeMode"])
            }
          >
            <option value="latest">Latest conditions</option>
            <option value="past">Past conditions</option>
          </select>
        </label>
        {settings.timeMode === "past" && (
          <label className="date-control">
            <span>Observation date</span>
            <input
              type="date"
              aria-label="Observation date"
              max={today()}
              value={settings.observationDate}
              onChange={(event) => {
                if (event.target.value <= today())
                  change("observationDate", event.target.value);
              }}
            />
          </label>
        )}
      </header>
      {layerOpen && (
        <div className="layer-popover" aria-label="Map layers">
          <div className="popover-top">
            <span>Map layers</span>
            <button
              aria-label="Close layers"
              onClick={() => setLayerOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div
            className="layer-options"
            role="group"
            aria-label="Select map layer"
          >
            {layers.map((layer) => (
              <button
                key={layer.value}
                className={settings.overlay === layer.value ? "chosen" : ""}
                onClick={() => change("overlay", layer.value)}
                aria-pressed={settings.overlay === layer.value}
              >
                <span className="layer-radio" />
                {layer.label}
              </button>
            ))}
          </div>
          <label className="opacity-label" htmlFor="opacity-control">
            <span>Layer opacity</span>
            <span>{Math.round(settings.opacity * 100)}%</span>
          </label>
          <input
            id="opacity-control"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.opacity * 100)}
            onChange={(event) =>
              change("opacity", Number(event.target.value) / 100)
            }
          />
        </div>
      )}
      <button
        className="mobile-controls-toggle"
        aria-expanded={panelOpen}
        aria-label={panelOpen ? "Close location panel" : "Open location panel"}
        onClick={() => setPanelOpen((open) => !open)}
      >
        <MapPin size={16} />
        {panelOpen ? "Close location panel" : "Open location panel"}
        <ChevronDown size={15} />
      </button>
      <aside
        className={`control-panel ${panelOpen ? "mobile-open" : "is-collapsed"}`}
        aria-label={intelOpen ? "Meridian Intel" : "Selected location details"}
      >
        {intelOpen ? (
          <>
            <div className="panel-topline">
              <button
                className="intel-back"
                onClick={() => setIntelOpen(false)}
              >
                <ArrowLeft size={17} />
                Back to location
              </button>
              <button
                className="panel-close"
                aria-label="Close location panel"
                onClick={() => setPanelOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="intel-heading">
              <span className="eyebrow">MERIDIAN INTEL</span>
              <h1>Ask a field question</h1>
              <p>Share a question with the current map context.</p>
            </div>
            <div className="intel-context">
              <strong>
                {settings.selection.name}
                {settings.selection.benchmarkId ? ", Kansas" : ""}
              </strong>
              <span>
                {selectedCrop} ·{" "}
                {settings.timeMode === "latest"
                  ? "Latest conditions"
                  : settings.observationDate}
              </span>
              {area && <span>Regional cell · {area}</span>}
            </div>
            <label className="question-label" htmlFor="intel-question">
              Your question
            </label>
            <textarea
              id="intel-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should I consider when comparing this area’s conditions?"
            />
            <div className="suggested-prompts">
              <span>Try asking</span>
              <button
                onClick={() =>
                  setQuestion("What does the selected NASA layer measure?")
                }
              >
                What does this layer measure?
              </button>
              <button
                onClick={() =>
                  setQuestion(
                    "How could these observations inform a crop decision?",
                  )
                }
              >
                How could this inform a crop decision?
              </button>
            </div>
            <div className="intel-notice">
              Analysis is not connected yet. Copy the request to share or use
              when analysis becomes available.
            </div>
            <button className="ask-button" onClick={copyRequest}>
              <MessageSquare size={17} />
              {copyFeedback || "Copy request"}
              <ArrowUpRight size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="panel-topline">
              <div>
                <span className="eyebrow">SELECTED LOCATION</span>
                <h1>
                  {settings.selection.name}
                  {settings.selection.benchmarkId ? ", Kansas" : ""}
                </h1>
              </div>
              <button
                className="panel-close"
                aria-label="Close location panel"
                onClick={() => setPanelOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="location-coords">
              <MapPin size={15} />
              <span>{coords}</span>
            </div>
            <label className="section-heading" htmlFor="benchmark-select">
              Benchmark location
            </label>
            <div className="select-wrap location-select">
              <select
                id="benchmark-select"
                aria-label="Benchmark location"
                value={settings.selection.benchmarkId ?? "custom"}
                onChange={(event) => chooseFarm(event.target.value)}
              >
                {!settings.selection.benchmarkId && (
                  <option value="custom">Map selection</option>
                )}
                {farms.map((farm) => (
                  <option value={farm.id} key={farm.id}>
                    {farm.name}, Kansas
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
            <div className="context-summary">
              <span>
                Crop<strong>{selectedCrop}</strong>
              </span>
              <span>
                Observation period
                <strong>
                  {settings.timeMode === "latest"
                    ? "Latest conditions"
                    : `Past · ${settings.observationDate}`}
                </strong>
              </span>
            </div>
            {area && (
              <div className="cell-area">
                <span>Regional cell</span>
                <strong>{area}</strong>
              </div>
            )}
            {settings.overlay !== "off" && (
              <section className="data-provenance">
                <div className="section-heading">
                  <span>NASA observation</span>
                  <span className="source-chip">
                    {settings.overlay.toUpperCase()}
                  </span>
                </div>
                {status.layer ? (
                  <>
                    <strong>{status.layer.label}</strong>
                    <span>
                      {status.layer.date} · {status.layer.units}
                    </span>
                    {status.layer.description && (
                      <p>{status.layer.description}</p>
                    )}
                    {status.layer.legend && (
                      <img
                        className="native-legend"
                        src={status.layer.legend}
                        alt={`${status.layer.label} data legend`}
                      />
                    )}
                  </>
                ) : (
                  <p>NASA GIBS imagery is loading for this layer.</p>
                )}
              </section>
            )}
            <button
              className="ask-button"
              onClick={() => {
                setIntelOpen(true);
                setCopyFeedback("");
              }}
            >
              <MessageSquare size={17} />
              Ask Meridian Intel
              <ArrowUpRight size={16} />
            </button>
          </>
        )}
      </aside>
      <div className="map-tools" aria-label="Map navigation">
        <button
          onClick={() => navigationAction("zoom-in")}
          aria-label="Zoom in"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => navigationAction("zoom-out")}
          aria-label="Zoom out"
        >
          <Minus size={18} />
        </button>
        <span className="tool-separator" />
        <button
          onClick={() => navigationAction("reset")}
          aria-label="Reset map view"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {(status.loading ||
        status.failed ||
        Boolean(status.message.trim()) ||
        Boolean(status.layer)) && (
        <div
          className={`map-status ${status.failed ? "status-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span
            className={`status-mark ${status.loading ? "is-loading" : status.failed ? "is-error" : ""}`}
          />
          <span className="status-message">
            {status.failed
              ? status.message
              : status.loading
                ? status.message
                : status.layer
                  ? `${status.layer.date} · ${status.layer.label}`
                  : status.message}
          </span>
          {status.failed && (
            <button onClick={() => setRetry((count) => count + 1)}>
              Retry
            </button>
          )}
        </div>
      )}
      {settings.overlay !== "off" && (
        <div className="source-attribution">NASA GIBS</div>
      )}
      <div className="preview-note">Select a hexagon to explore</div>
    </main>
  );
}
