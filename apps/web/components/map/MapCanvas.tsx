"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoPolygon } from "@spaceapps/shared";
import type { AtlasCell } from "@spaceapps/shared";
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
import { createDroughtOverlay } from "@/lib/map/drought";
import farms from "../../data/benchmark_farms.json";
import { atlasFeatureCollection, createAtlasDeckLayer, createAtlasDeckOverlay, isAtlasCell, validatedAtlasCells } from "@/lib/map/atlas-renderer";
import { DEFAULT_BASEMAP, getBasemapStyle } from "@/lib/map/basemaps";
import { regionalYieldBounds, regionalYieldCollection, yieldColorExpression } from "@/lib/map/regional-yield-renderer";

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
  const fallbackStyleDeferred = useRef(false);
  const appliedBasemap = useRef(props.basemap ?? DEFAULT_BASEMAP);
  const basemapRetry = useRef(props.basemapRetry ?? 0);
  const pendingBasemap = useRef(props.basemap ?? DEFAULT_BASEMAP);
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
  const droughtOverlay = useRef<ReturnType<typeof createDroughtOverlay> | null>(null);
  const atlasOverlay = useRef<any>(null);
  const atlasFallbackVisible = useRef(false);
  const atlasGeneration = useRef(0);
  const atlasFrameSamples = useRef<number[]>([]);
  const atlasLastSample = useRef(0);
  const atlasLastCommit = useRef(0);
  const atlasHoverH3 = useRef<string | null>(null);
  const atlasFrameCommitMs = useRef(0);
  const countyViewActive = useRef(false);
  const countyCamera = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const returnCamera = useRef<{ center: [number, number]; zoom: number }>(ATLAS_CAMERA);
  const countyFitNonce = useRef<number | undefined>(undefined);
  const countyFittedDataset = useRef<string | null>(null);

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
        style: getBasemapStyle(propsRef.current.basemap ?? DEFAULT_BASEMAP),
        center: cameras.current[mode.current].center,
        zoom: cameras.current[mode.current].zoom,
        maxZoom: 16,
        attributionControl: {},
      });
      mapRef.current = map;
      droughtOverlay.current = createDroughtOverlay(map, status => {
        if (element.current) element.current.dataset.droughtStatus = status;
        propsRef.current.onDroughtStatus?.(status);
      });
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
        void syncAtlasOverlay();
        syncRegionalYield();
        void droughtOverlay.current?.sync(!!propsRef.current.drought);
        const selected = propsRef.current.basemap ?? DEFAULT_BASEMAP;
        if (fallbackActive.current) {
          propsRef.current.onBasemapStatus?.({ selected, displayed: "local-fallback", state: "fallback" });
        } else {
          appliedBasemap.current = pendingBasemap.current = selected;
          propsRef.current.onBasemapStatus?.({ selected, displayed: selected, state: "ready" });
        }
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
          ? !["field-h3", "nasa-raster", "field-selection", "field-point", "atlas-regional-data", "atlas-county-yield", "usdm-observation"].includes(sourceId) && !sourceId.startsWith("field-draw")
          : /openfreemap|nationalmap\.gov|Failed to fetch|NetworkError/i.test(
              event.error?.message ?? "",
            );
        if (fallbackActive.current || !isBasemap) return;
        fallbackActive.current = true;
        const drawingMode = propsRef.current.drawing?.mode;
        propsRef.current.onBasemapStatus?.({ selected: pendingBasemap.current, displayed: drawingMode === "polygon" ? appliedBasemap.current : "local-fallback", state: "fallback" });
        if (drawingMode === "polygon") {
          fallbackStyleDeferred.current = true;
          return;
        }
        propsRef.current.onMapReady?.(false);
        reportDrawingReady(false);
        prepareMapStyleReload(map!);
        map!.setStyle(localStyle(), { diff: false });
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
        map.on("mousemove", hoverAtlasAt);
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
      removeAtlasOverlay();
      droughtOverlay.current?.dispose();
      droughtOverlay.current = null;
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
    map.addSource("atlas-regional-data", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("atlas-county-yield", {type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"atlas-county-fill",type:"fill",source:"atlas-county-yield",layout:{visibility:"none"},paint:{"fill-color":yieldColorExpression() as never,"fill-opacity":0.76}},before);
    map.addLayer({id:"atlas-county-line",type:"line",source:"atlas-county-yield",layout:{visibility:"none"},paint:{"line-color":["case",["get","selected"],"#183a24","#ffffff"],"line-width":["case",["get","selected"],2,0.8],"line-opacity":0.9}},before);
    map.addLayer({
      id: "atlas-regional-fill", type: "fill", source: "atlas-regional-data",
      layout: { visibility: "none" },
      paint: { "fill-color": ["get", "atlasColor"], "fill-opacity": 0.78 },
    }, before);
    map.addLayer({
      id: "atlas-regional-line", type: "line", source: "atlas-regional-data",
      layout: { visibility: "none" },
      paint: { "line-color": ["case", ["==", ["get", "h3Index"], propsRef.current.atlasSelectedH3 ?? ""], "#183a24", "#ffffff"], "line-width": ["case", ["==", ["get", "h3Index"], propsRef.current.atlasSelectedH3 ?? ""], 2.5, 0.7], "line-opacity": 0.9 },
    }, before);
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
      if (event.sourceId === "atlas-county-yield" && event.isSourceLoaded) {
        if (element.current) element.current.dataset.regionalReady = "true";
        if (propsRef.current.regionalYieldActive && propsRef.current.overlay === "off") propsRef.current.onStatus(idleStatus());
      }
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
    const countyMode = propsRef.current.mode === "atlas" && (propsRef.current.regionalYieldActive??!!propsRef.current.regionalYield);
    const region = !countyMode && propsRef.current.mode === "atlas" && selected.hexId && isValidCell(selected.hexId)
      ? selected.hexId : undefined;
    const features: Feature<Polygon>[] = region
      ? [h3CellFeature(region, getResolution(region))]
      : propsRef.current.mode === "field" && selected.boundary
        ? [{ type: "Feature", properties: {}, geometry: selected.boundary }] : [];
    const marker = region ? hexCenter(region) : selected;
    polygonSource.setData({ type: "FeatureCollection", features });
    pointSource.setData(countyMode?{type:"FeatureCollection",features:[]}:{
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

  function prepareMapStyleReload(map: MlMap) {
    propsRef.current.onMapReady?.(false);
    reportDrawingReady(false);
    const center = map.getCenter();
    cameras.current[mode.current] = { center: [center.lng, center.lat], zoom: map.getZoom() };
    const drawing = propsRef.current.drawing;
    if (terraDraw.current) {
      drawingSnapshot.current = terraDraw.current.getSnapshot();
      drawingSnapshotSession.current = drawing?.session;
      terraDraw.current.stop();
      terraDraw.current = null;
    }
    terraSelectMode.current = null;
    activeDrawMode.current = "";
    attached.current = false;
    drawingBuildGeneration.current++;
    generation.current++;
    window.clearTimeout(timeout.current);
    overlayCleanup.current?.();
    overlayCleanup.current = undefined;
    removeAtlasOverlay();
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
    const suppliedAtlas = propsRef.current.atlasCells;
    const countyLayer=propsRef.current.regionalYield;
    if(propsRef.current.mode==="atlas"&&(propsRef.current.regionalYieldActive??!!countyLayer)){
      if(!countyLayer)return;
      const f=map.queryRenderedFeatures(e.point,{layers:["atlas-county-fill"]})[0]; const fips=String(f?.properties?.fips??"");
      if(!fips)return;
      const region=countyLayer.data.regions.find(r=>r.fips===fips); if(!region)return;
      propsRef.current.onRegionalSelect?.(fips);
      const [longitude,latitude]=region.centroid;
      propsRef.current.onSelect({longitude,latitude,name:`${region.name}, ${region.state}`,hexId:hexAt(latitude,longitude,resolution.current)});
      return;
    }
    if (suppliedAtlas !== undefined) {
      let cell: AtlasCell | null = null;
      if (atlasOverlay.current) {
        const picked = atlasOverlay.current.pickObject({ x: e.point.x, y: e.point.y });
        if (picked?.object && isAtlasCell(picked.object)) cell = picked.object;
      }
      if (!cell && map.getLayer("atlas-regional-fill")) {
        const feature = map.queryRenderedFeatures(e.point, { layers: ["atlas-regional-fill"] })[0];
        const h3Index = feature?.properties?.h3Index;
        if (typeof h3Index === "string") cell = validatedAtlasCells(suppliedAtlas).find((item) => item.h3Index === h3Index) ?? null;
      }
      if (!cell) return;
      const center = hexCenter(cell.h3Index);
      propsRef.current.onSelect({ ...center, name: `Atlas region · ${cell.crop}`, hexId: cell.h3Index });
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
  function hoverAtlasAt(e: MapMouseEvent) {
    const p = propsRef.current;
    if(p.mode==="atlas"&&(p.regionalYieldActive??!!p.regionalYield)){
      const map=mapRef.current;const feature=map?.queryRenderedFeatures(e.point,{layers:["atlas-county-fill"]})[0];
      if(map)map.getCanvas().style.cursor=feature?"pointer":"";
      return;
    }
    if (p.mode !== "atlas" || p.atlasCells === undefined) return;
    if (atlasOverlay.current) return;
    const map = mapRef.current;
    const feature = map?.queryRenderedFeatures(e.point, { layers: ["atlas-regional-fill"] })[0];
    const h3Index = typeof feature?.properties?.h3Index === "string" ? feature.properties.h3Index : null;
    if (h3Index === atlasHoverH3.current) return;
    atlasHoverH3.current = h3Index;
    p.onAtlasHover?.(h3Index ? validatedAtlasCells(p.atlasCells).find((item) => item.h3Index === h3Index) ?? null : null);
  }
  function setAtlasFallback(enabled: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("atlas-regional-data") as GeoJSONSource | undefined;
    const cells = validatedAtlasCells(propsRef.current.atlasCells);
    if (enabled || atlasFallbackVisible.current) source?.setData(enabled ? atlasFeatureCollection(cells) : { type: "FeatureCollection", features: [] });
    atlasFallbackVisible.current = enabled;
    for (const id of ["atlas-regional-fill", "atlas-regional-line"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    }
  }
  function removeAtlasOverlay() {
    const map = mapRef.current;
    const overlay = atlasOverlay.current;
    atlasOverlay.current = null;
    atlasGeneration.current++;
    if (map && overlay) {
      try { map.removeControl(overlay); } catch { overlay.finalize?.(); }
    }
  }
  async function syncAtlasOverlay() {
    const map = mapRef.current;
    if (!map || !attached.current) return;
    const p = propsRef.current;
    const cells = validatedAtlasCells(p.atlasCells);
    const enabled = p.mode === "atlas" && p.atlasCells !== undefined;
    if (!enabled) {
      removeAtlasOverlay();
      setAtlasFallback(false);
      p.onAtlasHover?.(null);
      if (element.current) element.current.dataset.atlasRenderMode = "idle";
      p.onAtlasRenderStatus?.("idle");
      return;
    }
    const selected = p.atlasSelectedH3;
    if (map.getLayer("atlas-regional-line")) {
      map.setPaintProperty("atlas-regional-line", "line-color", ["case", ["==", ["get", "h3Index"], selected ?? ""], "#183a24", "#ffffff"]);
      map.setPaintProperty("atlas-regional-line", "line-width", ["case", ["==", ["get", "h3Index"], selected ?? ""], 2.5, 0.7]);
    }
    if (cells.length === 0) {
      removeAtlasOverlay();
      setAtlasFallback(false);
      if (element.current) {
        element.current.dataset.atlasRenderMode = "unavailable";
        element.current.dataset.atlasCells = "0";
      }
      p.onAtlasRenderStatus?.("unavailable");
      return;
    }
    setAtlasFallback(false);
    const generationId = ++atlasGeneration.current;
    const beforeId = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
    const onHover = (cell: AtlasCell | null) => {
      atlasHoverH3.current = cell?.h3Index ?? null;
      propsRef.current.onAtlasHover?.(cell);
    };
    const onAfterRender = () => {
      const now = performance.now();
      atlasFrameSamples.current = atlasFrameSamples.current.filter((stamp) => now - stamp <= 2000);
      atlasFrameSamples.current.push(now);
      if (atlasLastSample.current && now - atlasLastSample.current < 1000) return;
      atlasLastSample.current = now;
      if (atlasFrameSamples.current.length < 4) return;
      const first = atlasFrameSamples.current[0];
      const last = atlasFrameSamples.current[atlasFrameSamples.current.length - 1];
      const frameRate = last > first ? Math.round(((atlasFrameSamples.current.length - 1) * 1000) / (last - first)) : null;
      propsRef.current.onAtlasPerformance?.({ layerUpdateMs: atlasFrameCommitMs.current, sampledFrameRate: frameRate });
    };
    const startedAt = performance.now();
    try {
      if (!atlasOverlay.current) {
        const overlay = await createAtlasDeckOverlay(cells, selected, beforeId, onHover, () => {
          if (generationId !== atlasGeneration.current) return;
          removeAtlasOverlay();
          setAtlasFallback(true);
          if (element.current) element.current.dataset.atlasRenderMode = "fallback";
          propsRef.current.onAtlasRenderStatus?.("fallback");
        }, onAfterRender);
        if (generationId !== atlasGeneration.current || mapRef.current !== map) { overlay.finalize(); return; }
        map.addControl(overlay);
        atlasOverlay.current = overlay;
      } else {
        const layer = await createAtlasDeckLayer(cells, selected, beforeId, onHover);
        if (generationId !== atlasGeneration.current) return;
        atlasOverlay.current.setProps({ layers: [layer], onAfterRender });
      }
      atlasFrameCommitMs.current = performance.now() - startedAt;
      if (element.current) {
        element.current.dataset.atlasLayerUpdateMs = atlasFrameCommitMs.current.toFixed(1);
        element.current.dataset.atlasCells = String(cells.length);
        element.current.dataset.atlasScenarioId = cells[0]?.scenarioId ?? "";
        element.current.dataset.atlasRenderMode = "deck";
      }
      p.onAtlasPerformance?.({ layerUpdateMs: atlasFrameCommitMs.current, sampledFrameRate: null });
      p.onAtlasRenderStatus?.("deck");
    } catch {
      if (generationId !== atlasGeneration.current) return;
      removeAtlasOverlay();
      setAtlasFallback(true);
      if (element.current) element.current.dataset.atlasRenderMode = "fallback";
      p.onAtlasRenderStatus?.("fallback");
    }
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
    void syncAtlasOverlay();
  }, [props.mode, props.selection, props.drawing]);
  useEffect(() => {
    const map = mapRef.current;
    const next = props.basemap ?? DEFAULT_BASEMAP;
    const retryRequested = basemapRetry.current !== (props.basemapRetry ?? 0);
    basemapRetry.current = props.basemapRetry ?? 0;
    if (!map || (!retryRequested && next === appliedBasemap.current && !fallbackActive.current)) return;
    if (!retryRequested && pendingBasemap.current === next && fallbackActive.current) return;
    const drawing = propsRef.current.drawing;
    if (drawing?.mode === "polygon") return;
    prepareMapStyleReload(map);
    fallbackActive.current = false;
    pendingBasemap.current = next;
    propsRef.current.onBasemapStatus?.({ selected: next, displayed: appliedBasemap.current, state: "loading" });
    map.setStyle(getBasemapStyle(next), { diff: false });
  }, [props.basemap, props.basemapRetry, props.drawing?.mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.drawing?.mode === "polygon" || !fallbackStyleDeferred.current) return;
    fallbackStyleDeferred.current = false;
    prepareMapStyleReload(map);
    map.setStyle(localStyle(), { diff: false });
  }, [props.drawing?.mode]);
  useEffect(() => { void droughtOverlay.current?.sync(!!props.drought); }, [props.drought, props.droughtRetry]);
  useEffect(() => { void syncAtlasOverlay(); }, [props.atlasCells, props.atlasSelectedH3, props.mode]);
  useEffect(()=>{syncRegionalYield();},[props.regionalYield,props.regionalYieldActive,props.mode]);
  function syncRegionalYield(){
    const map=mapRef.current;if(!map||!attached.current||!map.getSource("atlas-county-yield"))return;
    const p=propsRef.current;const enabled=p.mode==="atlas"&&(p.regionalYieldActive??!!p.regionalYield);
    if (p.mode === "atlas" && enabled !== countyViewActive.current) {
      const centre = map.getCenter();
      const current = { center: [centre.lng, centre.lat] as [number, number], zoom: map.getZoom() };
      if (enabled) {
        returnCamera.current = { center: [...cameras.current.atlas.center] as [number, number], zoom: cameras.current.atlas.zoom };
        if (countyCamera.current) map.jumpTo(countyCamera.current);
      } else {
        countyCamera.current = current;
        map.jumpTo(returnCamera.current);
      }
      countyViewActive.current = enabled;
    }
    syncSelectionLayers();
    const src=map.getSource("atlas-county-yield") as GeoJSONSource;
    const hasData=enabled&&!!p.regionalYield;
    if(element.current)element.current.dataset.regionalReady="false";
    src.setData(hasData?regionalYieldCollection(p.regionalYield!.data,p.regionalYield!.crop,p.regionalYield!.period,p.regionalYield!.selectedFips):{type:"FeatureCollection",features:[]});
    if(element.current){element.current.dataset.regionalCountyCount=hasData?String(p.regionalYield!.data.regions.length):"0";element.current.dataset.regionalCrop=hasData?p.regionalYield!.crop:"";element.current.dataset.regionalPeriod=hasData?p.regionalYield!.period:"";}
    for(const id of ["atlas-county-fill","atlas-county-line"])if(map.getLayer(id))map.setLayoutProperty(id,"visibility",enabled?"visible":"none");
    for(const id of ["field-h3-fill","field-h3-line"])if(map.getLayer(id))map.setLayoutProperty(id,"visibility",enabled?"none":"visible");
    if(enabled){for(const id of ["atlas-regional-fill","atlas-regional-line"])if(map.getLayer(id))map.setLayoutProperty(id,"visibility","none");}
    const datasetId=hasData?p.regionalYield!.data.datasetId:null;
    if(hasData&&(p.regionalYield!.fitNonce!==countyFitNonce.current||datasetId!==countyFittedDataset.current)){
      const manualFit=p.regionalYield!.fitNonce!==countyFitNonce.current&&p.regionalYield!.fitNonce!==0;
      const initialFit=datasetId!==countyFittedDataset.current;
      countyFitNonce.current=p.regionalYield!.fitNonce;countyFittedDataset.current=datasetId;
      const bounds=regionalYieldBounds(p.regionalYield!.data);if(bounds&&(manualFit||initialFit))map.fitBounds(bounds,{padding:60,maxZoom:7,duration:motionDuration(500)});
    }
  }
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
    else if (n.action === "reset") {
      const county = propsRef.current.regionalYield;
      const bounds = county && regionalYieldBounds(county.data);
      if (propsRef.current.regionalYieldActive && bounds) m.fitBounds(bounds, { padding: 60, maxZoom: 7, duration: motionDuration(500) });
      else m.flyTo({ ...(props.mode === "field" ? DEFAULT_CAMERA : ATLAS_CAMERA), duration: motionDuration(500) });
    }
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
      aria-label={props.regionalYieldActive?"Published county yield effect map":"Geographic H3 hex map"}
      data-map-layer={props.regionalYieldActive?"regional-county-yield":"geographic-h3"}
      data-hex-resolution={resolution.current}
    />
  );
}
