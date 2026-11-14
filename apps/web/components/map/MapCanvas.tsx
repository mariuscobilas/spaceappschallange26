"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { cellToChildren } from "h3-js";
import {
  buildH3Collection,
  DEFAULT_CAMERA,
  ATLAS_CAMERA,
  hexAt,
  hexCenter,
  layerDates,
  MAP_STYLE,
  localStyle,
  OVERLAYS,
  resolutionForZoom,
  resolveObservationDate,
  tileTemplate,
  legendUrl,
} from "../../lib/map/engine";
import type {
  MapCanvasProps,
  LayerInfo,
  MapStatus,
  Selection,
} from "../../lib/map/types";
import farms from "../../data/benchmark_farms.json";

type Farm = { id: string; name: string; latitude: number; longitude: number };
const BENCHMARKS = farms as Farm[];
const EMPTY: MapStatus = { loading: false, message: "", failed: false };
const PALETTE = ["#d9e0d8", "#dce2da", "#d6ded6", "#dfe4dd"];

export default function MapCanvas(props: MapCanvasProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const grids = useRef<Partial<Record<2 | 3 | 4, FeatureCollection>>>({});
  const fallbackActive = useRef(false);
  const resolution = useRef<2 | 3 | 4 | 5>(4);
  const cameras = useRef({ field: DEFAULT_CAMERA, atlas: ATLAS_CAMERA });
  const mode = useRef(props.mode);
  const attached = useRef(false);
  const gridReady = useRef(false);
  const generation = useRef(0);
  const timeout = useRef<number | undefined>(undefined);
  const overlayCleanup = useRef<(() => void) | undefined>(undefined);
  const layerInfo = useRef<LayerInfo | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    propsRef.current.onStatus({
      loading: true,
      failed: false,
      message: "Preparing geographic hex grid…",
    });
    void (async () => {
      const [ml, boundary] = await Promise.all([
        import("maplibre-gl"),
        fetch("/data/conus.geojson").then(async (r) => {
          if (!r.ok) throw new Error("CONUS boundary unavailable");
          return r.json() as Promise<FeatureCollection>;
        }),
      ]);
      if (cancelled || !element.current) return;
      grids.current = {
        2: await buildH3Collection(boundary, 2),
        3: await buildH3Collection(boundary, 3),
        4: await buildH3Collection(boundary, 4),
      };
      if (cancelled || !element.current) return;
      mode.current = propsRef.current.mode;
      resolution.current = resolutionForZoom(
        cameras.current[mode.current].zoom,
      );
      if (element.current)
        element.current.dataset.hexResolution = String(resolution.current);
      ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      map = new ml.Map({
        container: element.current,
        style: MAP_STYLE,
        center: cameras.current[mode.current].center,
        zoom: cameras.current[mode.current].zoom,
        maxZoom: 16,
        attributionControl: {},
      });
      mapRef.current = map;
      map.on("style.load", () => {
        attached.current = false;
        addLayers(map!);
        syncData();
        void syncOverlay();
      });
      map.on("error", (event) => {
        const sourceId = (event as typeof event & { sourceId?: string })
          .sourceId;
        const isBasemap = sourceId
          ? !["field-h3", "nasa-raster"].includes(sourceId)
          : /openfreemap|Failed to fetch|NetworkError/i.test(
              event.error?.message ?? "",
            );
        if (fallbackActive.current || !isBasemap) return;
        fallbackActive.current = true;
        attached.current = false;
        generation.current++;
        window.clearTimeout(timeout.current);
        overlayCleanup.current?.();
        overlayCleanup.current = undefined;
        map!.setStyle(localStyle());
      });
      map.on("moveend", () => {
        const c = map!.getCenter();
        cameras.current[mode.current] = {
          center: [c.lng, c.lat],
          zoom: map!.getZoom(),
        };
        const next = resolutionForZoom(map!.getZoom());
        if (next !== resolution.current) {
          resolution.current = next;
          if (element.current)
            element.current.dataset.hexResolution = String(next);
          syncData();
        } else if (next === 5) syncData();
      });
      map.on("click", selectAt);
    })().catch((e) => {
      if (!cancelled)
        propsRef.current.onStatus({
          loading: false,
          failed: true,
          message: e instanceof Error ? e.message : "Map could not start",
        });
    });
    return () => {
      cancelled = true;
      generation.current++;
      window.clearTimeout(timeout.current);
      overlayCleanup.current?.();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  function idleStatus(): MapStatus {
    return fallbackActive.current
      ? {
          loading: false,
          failed: false,
          message: "Basemap unavailable — hex grid remains interactive.",
        }
      : EMPTY;
  }
  function addLayers(map: MlMap) {
    const before = map
      .getStyle()
      .layers.find(
        (layer) =>
          layer.type === "symbol" ||
          (layer.type === "line" && /road|transport/i.test(layer.id)),
      )?.id;
    map.addSource("field-h3", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer(
      {
        id: "field-h3-fill",
        type: "fill",
        source: "field-h3",
        paint: {
          "fill-color": [
            "case",
            ["get", "selected"],
            "#315b3c",
            ["get", "cellColor"],
          ],
          "fill-opacity": [
            "case",
            ["get", "selected"],
            0.46,
            ["case", ["get", "rasterActive"], 0.08, 0.2],
          ],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: "field-h3-line",
        type: "line",
        source: "field-h3",
        paint: {
          "line-color": ["case", ["get", "selected"], "#163d25", "#f7f8f5"],
          "line-width": ["case", ["get", "selected"], 2.2, 0.7],
          "line-opacity": 0.75,
        },
      },
      before,
    );
    map.on("sourcedata", (event) => {
      if (event.sourceId === "field-h3" && event.isSourceLoaded) {
        gridReady.current = true;
        if (propsRef.current.overlay === "off")
          propsRef.current.onStatus(idleStatus());
      }
    });
    attached.current = true;
  }
  function getGrid() {
    const r = resolution.current;
    if (r !== 5) return grids.current[r];
    const map = mapRef.current;
    if (!map) return grids.current[4];
    const b = map.getBounds().toArray();
    const pad = Math.max(1, 25 / map.getZoom());
    const parents = (grids.current[4]?.features ?? []).filter((f) => {
      const { longitude: lng, latitude: lat } = hexCenter(
        String(f.properties?.hexId),
      );
      return (
        lng >= Math.min(b[0][0], b[1][0]) - pad &&
        lng <= Math.max(b[0][0], b[1][0]) + pad &&
        lat >= Math.min(b[0][1], b[1][1]) - pad &&
        lat <= Math.max(b[0][1], b[1][1]) + pad
      );
    });
    const features = [] as NonNullable<FeatureCollection["features"]>;
    for (const f of parents) {
      for (const id of cellToChildren(String(f.properties?.hexId), 5)) {
        const boundary = awaitBoundary(id);
        features.push({
          type: "Feature",
          id,
          properties: { hexId: id, resolution: 5 },
          geometry: { type: "Polygon", coordinates: [boundary] },
        } as never);
        if (features.length >= 14999) break;
      }
      if (features.length >= 14999) break;
    }
    return { type: "FeatureCollection", features } as FeatureCollection;
  }
  function syncData() {
    const map = mapRef.current;
    if (!map || !attached.current) return;
    const p = propsRef.current;
    const src = map.getSource("field-h3") as GeoJSONSource;
    const grid = getGrid();
    const selectedId =
      p.selection.name === "Selected region"
        ? hexAt(p.selection.latitude, p.selection.longitude, resolution.current)
        : (p.selection.hexId ?? "");
    const selectedFarm = BENCHMARKS.find(
      (f) => f.id === p.selection.benchmarkId,
    );
    const features = (grid?.features ?? []).slice(0, 15000).map((f) => {
      const id = String(f.properties?.hexId);
      let h = 0;
      for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
      return {
        ...f,
        properties: {
          ...f.properties,
          cellColor: PALETTE[Math.abs(h) % PALETTE.length],
          selected:
            id === selectedId ||
            Boolean(
              selectedFarm &&
                hexAt(
                  selectedFarm.latitude,
                  selectedFarm.longitude,
                  resolution.current,
                ) === id,
            ),
          rasterActive: p.overlay !== "off",
        },
      };
    });
    src.setData({ type: "FeatureCollection", features });
    if (element.current) {
      element.current.dataset.hexResolution = String(resolution.current);
      element.current.dataset.hexCount = String(features.length);
    }
  }
  function selectAt(e: MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    const hit = map.queryRenderedFeatures(e.point, {
      layers: ["field-h3-fill"],
    })[0];
    const hexId = hit?.properties?.hexId as string | undefined;
    if (!hexId) return;
    const farm = BENCHMARKS.find(
      (f) => hexAt(f.latitude, f.longitude, resolution.current) === hexId,
    );
    if (farm) {
      propsRef.current.onSelect({
        name: farm.name,
        latitude: farm.latitude,
        longitude: farm.longitude,
        benchmarkId: farm.id,
        hexId,
      });
      return;
    }
    propsRef.current.onSelect({
      ...hexCenter(hexId),
      name: "Selected region",
      hexId,
    });
  }
  async function syncOverlay() {
    const map = mapRef.current;
    if (!map || !attached.current) return;
    const p = propsRef.current;
    const token = ++generation.current;
    window.clearTimeout(timeout.current);
    overlayCleanup.current?.();
    overlayCleanup.current = undefined;
    if (map.getLayer("nasa-raster")) map.removeLayer("nasa-raster");
    if (map.getSource("nasa-raster")) map.removeSource("nasa-raster");
    layerInfo.current = undefined;
    if (p.overlay === "off") {
      if (gridReady.current) p.onStatus(idleStatus());
      syncData();
      return;
    }
    const cfg = OVERLAYS[p.overlay];
    p.onStatus({
      loading: true,
      failed: false,
      message: `Loading NASA ${p.overlay.toUpperCase()} layer…`,
    });
    let date = "";
    let description = cfg.description;
    try {
      const meta = await layerDates(cfg.layer);
      if (token !== generation.current) return;
      if (p.timeMode === "latest") date = meta.defaultDate;
      else {
        const resolved = resolveObservationDate(meta.values, p.observationDate);
        if (!resolved)
          throw new Error(
            `No ${p.overlay.toUpperCase()} observation exists on or before ${p.observationDate}.`,
          );
        date = resolved;
        if (date !== p.observationDate)
          description += ` Showing ${date}, the latest observation available on or before ${p.observationDate}.`;
      }
    } catch (e) {
      if (token !== generation.current) return;
      const msg =
        e instanceof Error
          ? e.message
          : "NASA observation dates could not be verified.";
      p.onStatus({
        loading: false,
        failed: true,
        message:
          p.timeMode === "past"
            ? `${msg} No dated layer was substituted.`
            : "NASA date metadata unavailable.",
      });
      return;
    }
    if (token !== generation.current) return;
    const info: LayerInfo = {
      id: p.overlay,
      label:
        p.overlay === "smap"
          ? "Soil moisture"
          : p.overlay === "ndvi"
            ? "Vegetation index"
            : "Precipitation rate",
      date,
      units: cfg.units,
      legend: legendUrl(cfg.legend),
      description,
    };
    layerInfo.current = info;
    map.addSource("nasa-raster", {
      type: "raster",
      tiles: [tileTemplate(cfg.layer, date, cfg.matrix)],
      tileSize: 256,
      maxzoom: p.overlay === "ndvi" ? 8 : 6,
      attribution: "NASA GIBS",
    });
    map.addLayer(
      {
        id: "nasa-raster",
        type: "raster",
        source: "nasa-raster",
        paint: { "raster-opacity": p.opacity },
      },
      "field-h3-fill",
    );
    syncData();
    timeout.current = window.setTimeout(() => {
      if (token === generation.current) {
        overlayCleanup.current?.();
        overlayCleanup.current = undefined;
        removeRaster(map);
        p.onStatus({
          loading: false,
          failed: true,
          message: `NASA ${p.overlay.toUpperCase()} tiles timed out.`,
        });
      }
    }, 10000);
    const onSource = (ev: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (
        ev.sourceId === "nasa-raster" &&
        ev.isSourceLoaded &&
        token === generation.current
      ) {
        window.clearTimeout(timeout.current);
        map.off("sourcedata", onSource as never);
        overlayCleanup.current = () => map.off("error", onError as never);
        p.onStatus({ loading: false, failed: false, message: "", layer: info });
      }
    };
    const onError = (ev: { sourceId?: string }) => {
      if (ev.sourceId === "nasa-raster" && token === generation.current) {
        window.clearTimeout(timeout.current);
        map.off("sourcedata", onSource as never);
        map.off("error", onError as never);
        removeRaster(map);
        overlayCleanup.current = undefined;
        p.onStatus({
          loading: false,
          failed: true,
          message: `NASA ${p.overlay.toUpperCase()} tiles failed to load.`,
        });
      }
    };
    map.on("sourcedata", onSource as never);
    map.on("error", onError as never);
    overlayCleanup.current = () => {
      map.off("sourcedata", onSource as never);
      map.off("error", onError as never);
    };
  }
  function removeRaster(map: MlMap) {
    if (map.getLayer("nasa-raster")) map.removeLayer("nasa-raster");
    if (map.getSource("nasa-raster")) map.removeSource("nasa-raster");
  }
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prior = mode.current;
    if (prior !== props.mode) {
      const c = map.getCenter();
      cameras.current[prior] = { center: [c.lng, c.lat], zoom: map.getZoom() };
      mode.current = props.mode;
      map.flyTo({
        ...cameras.current[props.mode],
        duration: motionDuration(500),
      });
    }
    syncData();
  }, [props.mode, props.selection]);
  useEffect(() => {
    void syncOverlay();
  }, [props.overlay, props.retry, props.timeMode, props.observationDate]);
  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer("nasa-raster"))
      m.setPaintProperty("nasa-raster", "raster-opacity", props.opacity);
  }, [props.opacity]);
  function motionDuration(ms: number) {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : ms;
  }
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const n = props.navigation;
    if (n.action === "zoom-in" || n.action === "zoom-out")
      m.easeTo({
        zoom: m.getZoom() + (n.action === "zoom-in" ? 1 : -1),
        duration: motionDuration(400),
      });
    else if (n.action === "reset")
      m.flyTo({
        ...(props.mode === "field" ? DEFAULT_CAMERA : ATLAS_CAMERA),
        duration: motionDuration(500),
      });
    else if (n.action === "selection")
      m.flyTo({
        center: [props.selection.longitude, props.selection.latitude],
        zoom: Math.max(9, m.getZoom()),
        duration: motionDuration(500),
      });
  }, [props.navigation.nonce]);
  return (
    <div
      ref={element}
      className="map-canvas"
      role="region"
      aria-label="Geographic H3 hex map"
      data-hex-resolution={resolution.current}
    />
  );
}

// Imported lazily through the H3 module to keep geometry generation local.
import { cellToBoundary as awaitBoundary } from "h3-js";
