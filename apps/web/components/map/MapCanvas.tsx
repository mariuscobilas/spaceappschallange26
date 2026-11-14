"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoPolygon } from "@spaceapps/shared";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { cellToChildren, getResolution, isValidCell } from "h3-js";
import { analyzeBoundary } from "../../lib/fields/geometry";
import {
  buildH3Collection,
  h3CellFeature,
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
  const conusBoundary = useRef<FeatureCollection | null>(null);
  const terraDraw = useRef<any>(null);
  const terraSelectMode = useRef<any>(null);
  const activeDrawMode = useRef("");
  const drawingSession = useRef<number | undefined>(undefined);
  const drawingSnapshotSession = useRef<number | undefined>(undefined);
  const drawingBuildGeneration = useRef(0);
  const drawingSnapshot = useRef<any[]>([]);
  const finishRequest = useRef(0);
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
  const initialFieldFocusApplied = useRef(false);

  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

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
      conusBoundary.current = boundary;
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
        terraDraw.current = null;
        terraSelectMode.current = null;
        activeDrawMode.current = "";
        drawingBuildGeneration.current++;
        addLayers(map!);
        syncData();
        syncSelectionLayers();
        void syncDrawing();
        void syncOverlay();
        if (!initialFieldFocusApplied.current) {
          initialFieldFocusApplied.current = true;
          focusFieldSelection(map!);
        }
        propsRef.current.onMapReady?.(true);
      });
      map.on("error", (event) => {
        const sourceId = (event as typeof event & { sourceId?: string })
          .sourceId;
        const isBasemap = sourceId
          ? !["field-h3", "nasa-raster", "field-selection", "field-point"].includes(sourceId) && !sourceId.startsWith("field-draw")
          : /openfreemap|Failed to fetch|NetworkError/i.test(
              event.error?.message ?? "",
            );
        if (fallbackActive.current || !isBasemap) return;
        fallbackActive.current = true;
        attached.current = false;
        propsRef.current.onMapReady?.(false);
        reportDrawingReady(false);
        if (terraDraw.current) {
          drawingSnapshot.current = terraDraw.current.getSnapshot();
          drawingSnapshotSession.current = propsRef.current.drawing?.session;
        }
        terraDraw.current?.stop();
        terraDraw.current = null;
        terraSelectMode.current = null;
        activeDrawMode.current = "";
        drawingBuildGeneration.current++;
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
      terraDraw.current?.stop();
      terraDraw.current = null;
      terraSelectMode.current = null;
      activeDrawMode.current = "";
      propsRef.current.onMapReady?.(false);
      reportDrawingReady(false);
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
    map.addSource("field-selection", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "field-selection-fill",
      type: "fill",
      source: "field-selection",
      paint: { "fill-color": "#315b3c", "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: "field-selection-line",
      type: "line",
      source: "field-selection",
      paint: { "line-color": "#163d25", "line-width": 2.5 },
    });
    map.addSource("field-point", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "field-point-dot",
      type: "circle",
      source: "field-point",
      paint: {
        "circle-radius": 7,
        "circle-color": "#315b3c",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
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
        features.push(h3CellFeature(id, 5));
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
    const selectedId = p.selection.hexId ?? "";
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
  function syncSelectionLayers() {
    const map = mapRef.current;
    if (!map || !attached.current) return;
    const selected = propsRef.current.selection;
    const polygonSource = map.getSource("field-selection") as GeoJSONSource;
    const pointSource = map.getSource("field-point") as GeoJSONSource;
    const region = propsRef.current.mode === "atlas" && selected.hexId && isValidCell(selected.hexId)
      ? selected.hexId : undefined;
    const features: Feature<Polygon>[] = region
      ? [h3CellFeature(region, getResolution(region))]
      : propsRef.current.mode === "field" && selected.boundary
        ? [{ type: "Feature", properties: {}, geometry: selected.boundary }] : [];
    const marker = region ? hexCenter(region) : selected;
    polygonSource.setData({ type: "FeatureCollection", features });
    pointSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
      }],
    });
  }

  function focusFieldSelection(map: MlMap) {
    const selection = propsRef.current.selection;
    if (selection.fieldId && selection.boundary && propsRef.current.mode === "field") {
      const positions = selection.boundary.coordinates.flat();
      if (!positions.length) return;
      const west = Math.min(...positions.map(([longitude]) => longitude));
      const east = Math.max(...positions.map(([longitude]) => longitude));
      const south = Math.min(...positions.map(([, latitude]) => latitude));
      const north = Math.max(...positions.map(([, latitude]) => latitude));
      map.fitBounds([[west, south], [east, north]], {
        padding: 64,
        maxZoom: 16,
        duration: motionDuration(500),
      });
    } else if (selection.fieldId) {
      map.flyTo({
        center: [selection.longitude, selection.latitude],
        zoom: Math.max(propsRef.current.mode === "field" ? 13 : 9, map.getZoom()),
        duration: motionDuration(500),
      });
    }
  }

  function reportDrawingReady(ready: boolean) {
    if (element.current) element.current.dataset.drawingReady = String(ready);
    propsRef.current.onDrawingReady?.(ready);
  }

  async function syncDrawing() {
    const map = mapRef.current;
    if (!map || !attached.current) return;
    const drawing = propsRef.current.drawing;
    if (!drawing) return;
    if (drawing.mode !== "polygon" && drawing.mode !== "edit") {
      reportDrawingReady(false);
      terraDraw.current?.stop();
      terraDraw.current = null;
      terraSelectMode.current = null;
      activeDrawMode.current = "";
      drawingSnapshot.current = [];
      return;
    }
    if (drawingSnapshotSession.current !== undefined && drawingSnapshotSession.current !== drawing.session) {
      drawingSnapshot.current = [];
    }
    if (drawingSession.current !== drawing.session || !terraDraw.current) {
      reportDrawingReady(false);
      terraDraw.current?.stop();
      terraDraw.current = null;
      drawingSession.current = drawing.session;
      drawingSnapshotSession.current = drawing.session;
      const buildGeneration = ++drawingBuildGeneration.current;
      const requestedMode = drawing.mode;
      const requestedSession = drawing.session;
      const drawingModules = await Promise.all([
        import("terra-draw"),
        import("terra-draw-maplibre-gl-adapter"),
      ]).catch(() => null);
      if (!drawingModules) {
        if (buildGeneration === drawingBuildGeneration.current)
          propsRef.current.onDrawingStatus?.("Drawing tools could not load. Cancel drawing and try again.");
        return;
      }
      const [td, adapter] = drawingModules;
      const latestDrawing = propsRef.current.drawing;
      if (
        map !== mapRef.current ||
        !attached.current ||
        buildGeneration !== drawingBuildGeneration.current ||
        latestDrawing?.session !== requestedSession ||
        latestDrawing?.mode !== requestedMode
      ) return;
      const modes: any[] = [new td.TerraDrawPolygonMode({ keyEvents: { finish: "Enter" } })];
      const selectMode = drawing.mode === "edit" ? new td.TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: {
              draggable: true,
              rotateable: false,
              scaleable: false,
              coordinates: {
                draggable: true,
                midpoints: { draggable: true },
                deletable: false,
              },
            },
          },
        },
      }) : null;
      if (selectMode) modes.push(selectMode);
      const draw = new td.TerraDraw({
        adapter: new adapter.TerraDrawMapLibreGLAdapter({ map, prefixId: "field-draw" }),
        modes,
      });
      draw.start();
      terraDraw.current = draw;
      terraSelectMode.current = selectMode;
      draw.on("finish", (id: string | number, context: { action: string }) => {
        if (terraDraw.current !== draw) return;
        if (context.action !== "draw" && context.action !== "dragCoordinate" && context.action !== "dragFeature") return;
        const feature = draw.getSnapshot().find((item: Feature) => String(item.id) === String(id));
        if (feature?.geometry.type !== "Polygon") return;
        const boundary: GeoPolygon = {
          type: "Polygon",
          coordinates: feature.geometry.coordinates.map((ring: number[][]) =>
            ring.map(([longitude, latitude]) => [longitude, latitude]),
          ) as [number, number][][],
        };
        drawingSnapshot.current = [feature];
        drawingSnapshotSession.current = requestedSession;
        const analysis = analyzeBoundary(boundary);
        propsRef.current.onDrawingStatus?.(
          analysis?.error ??
            (analysis ? "Field boundary updated." : "The boundary is invalid."),
        );
        propsRef.current.onBoundaryChange?.(boundary);
      });
      draw.on("change", () => {
        if (terraDraw.current !== draw) return;
        drawingSnapshot.current = draw.getSnapshot() as Feature[];
        drawingSnapshotSession.current = requestedSession;
        const feature = [...drawingSnapshot.current].reverse().find((item: Feature) => item.geometry.type === "Polygon");
        if (feature?.geometry.type !== "Polygon") return;
        const analysis = analyzeBoundary({ type: "Polygon", coordinates: feature.geometry.coordinates as [number, number][][] });
        if (analysis?.error) propsRef.current.onDrawingStatus?.(analysis.error);
      });
      const restoreSnapshot = drawingSnapshot.current;
      let selectedFeatureId: string | number | undefined;
      if (restoreSnapshot.length) {
        const results = draw.addFeatures(restoreSnapshot);
        selectedFeatureId = [...results].reverse().find((item: { valid: boolean }) => item.valid)?.id;
      } else if (drawing.boundary && drawing.mode === "edit") {
        const [result] = draw.addFeatures([{ type: "Feature", geometry: drawing.boundary, properties: { mode: "polygon" } }]);
        if (result?.valid) selectedFeatureId = result.id;
      }
      activeDrawMode.current = "";
      if (drawing.mode === "polygon") {
        draw.setMode("polygon");
        activeDrawMode.current = "polygon";
      } else {
        draw.setMode("select");
        activeDrawMode.current = "select";
        if (selectedFeatureId !== undefined) selectMode?.selectFeature(selectedFeatureId);
      }
      reportDrawingReady(true);
      propsRef.current.onDrawingStatus?.(drawing.mode === "polygon"
        ? "Click to add vertices. Finish boundary or double-click to complete; Cancel drawing discards the draft."
        : "Drag vertices to edit. Finish boundary to review and save your changes.");
    }
    const draw = terraDraw.current;
    const desiredMode = drawing.mode === "polygon" ? "polygon" : "select";
    if (activeDrawMode.current !== desiredMode) {
      draw.setMode(desiredMode);
      activeDrawMode.current = desiredMode;
      if (desiredMode === "select") {
        const feature = [...draw.getSnapshot()].reverse().find((item: Feature) => item.geometry.type === "Polygon");
        if (feature?.id !== undefined) terraSelectMode.current?.selectFeature(feature.id);
      }
    }
    if (drawing.finish !== finishRequest.current) {
      finishRequest.current = drawing.finish;
      map.getCanvas().dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
      );
    }
  }
  function selectAt(e: MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    const drawingMode = propsRef.current.drawing?.mode;
    if (drawingMode === "polygon" || drawingMode === "edit") return;
    if (propsRef.current.mode === "field") {
      const { lng, lat } = e.lngLat;
      const withinConus = conusBoundary.current?.features.some((feature) =>
        feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"
          ? booleanPointInPolygon(point([lng, lat]), feature.geometry)
          : false,
      ) ?? false;
      if (!withinConus) {
        propsRef.current.onDrawingStatus?.("Choose a point within the contiguous United States.");
        return;
      }
      propsRef.current.onSelect({ latitude: lat, longitude: lng, name: "Selected point" });
      return;
    }
    const hit = map.queryRenderedFeatures(e.point, {
      layers: ["field-h3-fill"],
    })[0];
    const hexId = hit?.properties?.hexId as string | undefined;
    if (!hexId) return;
    const farm = BENCHMARKS.find(
      (f) => hexAt(f.latitude, f.longitude, resolution.current) === hexId,
    );
    propsRef.current.onSelect({
      ...hexCenter(hexId),
      name: farm ? `Region near ${farm.name}` : "Selected region",
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
    syncSelectionLayers();
    void syncDrawing();
  }, [props.mode, props.selection, props.drawing]);
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
    else if (n.action === "selection") {
      if (props.selection.fieldId) {
        focusFieldSelection(m);
      } else {
        m.flyTo({
          center: [props.selection.longitude, props.selection.latitude],
          zoom: Math.max(9, m.getZoom()),
          duration: motionDuration(500),
        });
      }
    }
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
