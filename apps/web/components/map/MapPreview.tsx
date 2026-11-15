"use client";

import type { AtlasCell } from "@spaceapps/shared";
import { useAtlas } from "@/lib/atlas/use-atlas";
import { useRegionalYield } from "@/lib/atlas/regional-yield";
import { RegionalYieldDetails } from "@/components/atlas/RegionalYieldDetails";
import { AtlasContext } from "@/components/atlas/AtlasContext";
import { ResearchMapFooter } from "@/components/atlas/ResearchMapFooter";
import { parseResearchView, researchViewHref, type ResearchView } from "@/lib/map/research-view";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { RegionalYieldControls } from "@/components/atlas/RegionalYieldControls";
import { FieldDetails } from "@/components/map/FieldDetails";
import { DroughtControls } from "@/components/map/DroughtControls";
import { MapDataStatus } from "@/components/map/MapDataStatus";
import type { DroughtStatus } from "@/lib/map/drought";
import dynamic from "next/dynamic";
import { useSearchParams, usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cellToLatLng, isValidCell } from "h3-js";
import {
  CloudRain,
  Droplets,
  Info,
  Layers3,
  Leaf,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { AtlasRegionOverview } from "@/components/map/AtlasRegionOverview";
import { MyFieldsPanel } from "@/components/map/MyFieldsPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { today, validDate } from "@/lib/workspace";
import type { Overlay, Selection, TimeMode } from "@/lib/map/types";
import type { BasemapStatus } from "@/lib/map/types";
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP } from "@/lib/map/basemaps";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-3">
      <Skeleton className="size-5" />
      <span className="text-sm text-muted-foreground">Preparing map…</span>
    </div>
  ),
});
const layers = [
  {
    value: "smap",
    label: "Soil moisture · SMAP",
    short: "Soil moisture",
    icon: Droplets,
    description:
      "Regional surface soil moisture. This does not measure an individual field’s root zone.",
  },
  {
    value: "ndvi",
    label: "Vegetation · NDVI",
    short: "Vegetation",
    icon: Leaf,
    description:
      "Vegetation greenness from an 8-day composite. Review seasonal patterns across an area.",
  },
  {
    value: "imerg",
    label: "Rainfall · IMERG",
    short: "Rainfall",
    icon: CloudRain,
    description:
      "Estimated precipitation rate at the observation time, in mm/hour; not a daily total or forecast.",
  },
] as const;

export default function MapPreview() {
  const {
    settings,
    change,
    selectLocation,
    navigation,
    navigateMap,
    status,
    reportStatus,
    retry,
    retryImagery,
    activeField,
    fieldDraft,
    drawing,
    beginField,
    chooseField,
    editField,
    receiveBoundary,
    finishDrawing,
    cancelField,
    requestTransition,
    hasUnsavedChanges,
    dismissFieldNotice,
  } = useMeridian();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [droughtStatus, setDroughtStatus] = useState<DroughtStatus>("off");
  const [basemapRetry, setBasemapRetry] = useState(0);
  const [droughtRetry, setDroughtRetry] = useState(0);
  const [selectPointArmed, setSelectPointArmed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isExplore = pathname === "/";
  const isFields = pathname === "/fields";
  const query = useSearchParams();
  const view = parseResearchView(new URLSearchParams(query.toString()));
  const isAtlas = isExplore && view.view === "research";
  const updateView = (patch: Partial<ResearchView>, replace = false) => {
    const href = researchViewHref({ ...view, ...patch });
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };
  // Financial rendering remains implemented separately, without an unavailable UI entry.
  const atlas = useAtlas(false);
  const regional = useRegionalYield(isAtlas);
  const [browseSelection, setBrowseSelection] = useState<Selection>(() => ({
    name: settings.selection.hexId ? settings.selection.name : "Selected region",
    latitude: settings.selection.latitude, longitude: settings.selection.longitude,
    hexId: settings.selection.hexId,
  }));
  const [layerMode,setLayerMode]=useState<"yield"|"returns">("yield");
  const countyCrop = view.crop;
  const countyPeriod = view.period;
  const selectedFips = regional.data?.regions.some(r => r.fips === view.county) ? view.county : undefined;
  const setCountyCrop = (crop: "corn" | "soybeans") => updateView({ crop });
  const setCountyPeriod = (period: "2019-2020" | "2019" | "2020") => updateView({ period });
  const setSelectedFips = (county?: string) => updateView({ county });
  const [fitNonce,setFitNonce]=useState(0);
  const selectedCounty = regional.data?.regions.find(r => r.fips === selectedFips);
  const countyTitle = selectedCounty ? `${selectedCounty.name}, ${selectedCounty.state}` : "Historical cover-crop research";
  const coverageCounty = activeField && regional.data?.regions.find(r => booleanPointInPolygon(
    point([activeField.location.longitude, activeField.location.latitude]), r.geometry as Parameters<typeof booleanPointInPolygon>[1]));
  const coverage = !activeField ? undefined : regional.loading ? "Checking study coverage…"
    : regional.data?.status !== "available" ? "Study coverage unavailable."
    : settings.crop !== "corn" && settings.crop !== "soybeans" ? `This study does not cover ${settings.crop}.`
    : !coverageCounty ? "This study does not cover your field's sample location."
    : coverageCounty.estimates.some(e => e.crop === settings.crop && e.period === countyPeriod)
      ? `Study records are available at your field's sample location for ${settings.crop}, ${countyPeriod}.`
      : "No qualifying estimate for your field's crop and the selected study period.";
  useEffect(() => { setDetailsOpen(false); }, [isAtlas]);
  const handledResearchEntry = useRef(false);
  useEffect(() => {
    if (!isAtlas) { handledResearchEntry.current = false; return; }
    if (!regional.data || handledResearchEntry.current) return;
    handledResearchEntry.current = true;
    if (selectedFips && !mapOptionsOpen) setDetailsOpen(true);
  }, [isAtlas, regional.data, selectedFips]);
  useEffect(() => {
    if (isAtlas && view.county && regional.data?.status === "available" && !selectedFips) updateView({ county: undefined }, true);
  }, [isAtlas, view.county, regional.data, selectedFips]);
  const regionalLayer=useMemo(()=>isAtlas&&layerMode==="yield"&&regional.data?.status==="available"?{data:regional.data,crop:countyCrop,period:countyPeriod,selectedFips,fitNonce}:null,[isAtlas,layerMode,regional.data,countyCrop,countyPeriod,selectedFips,fitNonce]);
  const [requestedScenario, setScenarioId] = useState("");
  const scenarioId = atlas.data?.scenarios.some(s => s.id === requestedScenario) ? requestedScenario : atlas.data?.scenarios[0]?.id ?? "";
  const scenario = atlas.data?.scenarios.find(s => s.id === scenarioId);
  const atlasCells = useMemo(() => atlas.data?.status === "available" ? atlas.data.cells.filter(c => c.crop === settings.crop && c.scenarioId === scenarioId) : [], [atlas.data, settings.crop, scenarioId]);
  const [atlasHover, setAtlasHover] = useState<AtlasCell | null>(null);
  const [atlasRenderer, setAtlasRenderer] = useState("idle");
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus | null>(null);
  const selectedBasemap = settings.basemap ?? DEFAULT_BASEMAP;
  const basemapInfo = BASEMAP_OPTIONS.find((option) => option.value === selectedBasemap)!;
  useEffect(() => setAtlasHover(null), [scenarioId, settings.crop, pathname]);

  const isMobile = useIsMobile();
  const mapDrawing = isFields || drawing.mode === "browse"
    ? drawing
    : { ...drawing, mode: "browse" as const };
  const infoButton = useRef<HTMLButtonElement>(null);
  const atlasRegion = isAtlas;
  const [mapReady, setMapReady] = useState(false);
  const [drawingReady, setDrawingReady] = useState(false);
  const [drawingMessage, setDrawingMessage] = useState("");
  useEffect(() => {
    if (isFields && fieldDraft?.boundary && drawing.mode === "browse") setDetailsOpen(true);
  }, [fieldDraft?.boundary, drawing.mode]);
  useEffect(() => {
    setDetailsOpen(false);
    setMapOptionsOpen(false);
    setSelectPointArmed(false);
    setDrawingMessage("");
    if (!isFields && fieldDraft && !hasUnsavedChanges()) cancelField();

  }, [pathname]);
  const select = (selection: Selection) =>
    requestTransition(() => {
      if (isFields && selectPointArmed) {
        beginField(selection);
        setSelectPointArmed(false);
        setDrawingMessage("");
        setDetailsOpen(true);
      } else if (isExplore) {
        if (!isAtlas) setBrowseSelection(selection);
        setMapOptionsOpen(false);
        setDetailsOpen(true);
      } else {
        if (fieldDraft) cancelField();
        selectLocation(selection);
      }
    });
  const layer = layers.find((l) => l.value === settings.overlay);
  const inspectField = () => requestTransition(() => {
    const selected = isAtlas && selectedCounty ? {
      name: "Selected region", latitude: selectedCounty.centroid[1], longitude: selectedCounty.centroid[0],
    } : browseSelection;
    selectLocation(selected);
    setDetailsOpen(false);
    navigateMap("selection");
    router.push("/fields");
  });

  const selectPoint = () => requestTransition(() => {
    if (fieldDraft) cancelField();
    dismissFieldNotice();
    setSelectPointArmed(true);
    setDrawingMessage("Click the map to place a field point.");
    setDetailsOpen(false);
  });
  const drawBoundary = () => requestTransition(() => {
    setSelectPointArmed(false);
    beginField(undefined, true);
    setDrawingReady(false);
    setDetailsOpen(false);
    setDrawingMessage("Preparing drawing tools…");
  });
  const openField = (id: string) => requestTransition(() => {
    setSelectPointArmed(false);
    setDrawingMessage("");
    chooseField(id);
    setDetailsOpen(true);
  });
  const planField = (id: string) => requestTransition(() => {
    chooseField(id);
    router.push("/planner/calendar");
  });

  return (
    <AtlasContext.Provider value={{ ...atlas, scenario, scenarioId, setScenarioId, cells: atlasCells, renderer: atlasRenderer, layerMode,setLayerMode,regional:regional.data,regionalLoading:regional.loading,regionalFallback:regional.sourceFallback,retryRegional:regional.retry,countyCrop,setCountyCrop,countyPeriod,setCountyPeriod,selectedFips,setSelectedFips,fitCounties:()=>setFitNonce(n=>n+1),regionalLayer }}>
    <div
      className="workspace-map relative flex h-full min-h-0 min-w-0 flex-col"
      aria-label={isExplore ? "Explore workspace" : "My fields workspace"}
    >
      <header
        className={isExplore ? "map-toolbar pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3 [&>button]:pointer-events-auto" : isFields ? "map-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b bg-background px-3 py-2" : "map-toolbar grid grid-cols-[2rem_minmax(0,1fr)_2rem] shrink-0 items-end gap-2 sm:flex sm:flex-wrap border-b bg-background px-3 py-2"}
        style={isAtlas && detailsOpen && !isMobile ? { right: "25rem" } : undefined}
        aria-label="Map toolbar"
      >
        <SidebarTrigger aria-label="Toggle navigation" size="icon" className="bg-background/95 shadow-sm" />
        <h1 className="sr-only">{isExplore ? "Explore" : isAtlas ? "Regional Atlas" : "My fields"}</h1>
        {isFields && <Link href="/planner" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">Back to Field Planner</Link>}
        {isFields && isMobile && <MyFieldsPanel mapReady={mapReady} onSelectPoint={selectPoint} onDrawBoundary={drawBoundary} onSelectField={openField} onPlanField={planField} />}
        <Sheet open={mapOptionsOpen} onOpenChange={setMapOptionsOpen}>
          <SheetTrigger render={<Button variant="outline" className={isFields ? "pointer-events-auto ml-auto min-h-11 bg-background/95 shadow-sm" : "pointer-events-auto col-start-2 justify-self-end sm:ml-auto min-h-11 bg-background/95 shadow-sm"} />} aria-label="Map options">
            <Layers3 data-icon="inline-start" />Map options
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0" aria-label="Map options">
            <SheetHeader className="shrink-0 border-b pr-12">
              <SheetTitle>Map options</SheetTitle>
              <SheetDescription>{isAtlas ? "Choose a background map and historical study filters." : "Choose a background map, data layers, and observation dates."}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isExplore && <Field className="mb-5">
              <FieldLabel htmlFor="explore-data-view">Data view</FieldLabel>
              <NativeSelect id="explore-data-view" value={isAtlas ? "research" : "conditions"} onChange={e => updateView({ view: e.target.value === "research" ? "research" : "conditions" })}>
                <NativeSelectOption value="conditions">Conditions</NativeSelectOption>
                <NativeSelectOption value="research">Historical research</NativeSelectOption>
              </NativeSelect>
            </Field>}
            <FieldGroup className="mb-5">
              <Field>
                <FieldLabel htmlFor="map-basemap">Base map</FieldLabel>
                <NativeSelect id="map-basemap" aria-label="Base map" className="w-full" value={selectedBasemap} disabled={drawing.mode === "polygon"} onChange={(event) => change("basemap", event.target.value as NonNullable<typeof settings.basemap>)}>
                  {BASEMAP_OPTIONS.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label} · {option.provider}</NativeSelectOption>)}
                </NativeSelect>
                <p className="text-sm text-muted-foreground">{basemapInfo.description}</p>
                <p className="text-xs text-muted-foreground">{basemapInfo.sourceNote}</p>
                {drawing.mode === "polygon" && <FieldDescription>Finish or cancel boundary drawing before changing the base map. Your in-progress vertices stay in place.</FieldDescription>}
              </Field>
              {basemapStatus?.state === "fallback" && <Alert role="status"><AlertDescription>{drawing.mode === "polygon" ? "Selected basemap is unavailable. The current map stays visible until boundary drawing is finished or canceled." : "Selected basemap is unavailable. The local fallback map is shown."}</AlertDescription><Button variant="outline" size="sm" disabled={drawing.mode === "polygon"} onClick={() => setBasemapRetry(v => v + 1)}>Retry base map</Button></Alert>}
            </FieldGroup>
            <Separator className="my-5" />
            {isAtlas ? <>
              <RegionalYieldControls onInspect={() => { setMapOptionsOpen(false); setDetailsOpen(true); }} />
              {coverage && <p role="status" className="mt-3 text-sm text-muted-foreground">{activeField?.name}: {coverage} This is sample-point overlap, not whole-field coverage.</p>}
              <Button className="mt-3 min-h-11" variant="ghost" onClick={() => updateView({ view: "conditions" })}>Return to conditions</Button>
            </> : <>
            <DroughtControls enabled={!!settings.drought} status={droughtStatus} onChange={value => change("drought", value)} retry={() => setDroughtRetry(v => v + 1)} />
            <Field className="mb-5">
              <FieldLabel className="text-xs text-muted-foreground">Map layer</FieldLabel>
            <ToggleGroup
              orientation="vertical"
              aria-label="Select map layer"
              value={[settings.overlay]}
              onValueChange={(v) => {
                if (v[0]) change("overlay", v[0] as Overlay);
              }}
              className="w-full items-stretch"
              spacing={1}
            >
              <ToggleGroupItem
                value="off"
                aria-label="No overlay"
                className="justify-start"
              >
                Clean basemap
              </ToggleGroupItem>
              {layers.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={label}
                  className="justify-start"
                >
                  <Icon data-icon="inline-start" />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {layer && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {layer.description}
                </p>
                <Separator />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="layer-opacity">
                      Layer opacity · {Math.round(settings.opacity * 100)}%
                    </FieldLabel>
                    <Slider
                      id="layer-opacity"
                      aria-label="Layer opacity"
                      value={settings.opacity * 100}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => change("opacity", Number(v) / 100)}
                      className="py-3"
                    />
                  </Field>
                </FieldGroup>
              </>
            )}
            {status.layer && !status.failed && !status.loading && <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground"><span>Observed {status.layer.date} · {status.layer.units}</span>{status.layer.legend && <img src={status.layer.legend} alt={`${status.layer.label} data legend`} className="h-14 w-full object-contain object-left" />}<span>NASA GIBS</span></div>}
            </Field>
            <Separator className="my-5" />
            <FieldGroup>
          <Field>
            <FieldLabel htmlFor="observation-period" className="text-xs text-muted-foreground">
              Observation period
            </FieldLabel>
            <NativeSelect
              id="observation-period"
              aria-label="Observation period"
              value={settings.timeMode}
              className="w-full"
              onChange={(e) => change("timeMode", e.target.value as TimeMode)}
            >
              <NativeSelectOption value="latest">
                Latest conditions
              </NativeSelectOption>
              <NativeSelectOption value="past">
                Past conditions
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {settings.timeMode === "past" && (
            <Field>
              <FieldLabel htmlFor="observation-date" className="text-xs text-muted-foreground">
                Observation date
              </FieldLabel>
              <Input
                id="observation-date"
                aria-label="Observation date"
                type="date"
                max={today()}
                value={settings.observationDate}
                onChange={(e) => {
                  if (validDate(e.target.value))
                    change("observationDate", e.target.value);
                }}
              />
            </Field>
          )}
            </FieldGroup>
            </>}
            </div>
          </SheetContent>
        </Sheet>
        {(isAtlas || (isFields && (!!activeField || !!fieldDraft))) && <Button
          variant="ghost"
          size="icon"
          aria-label="Selected location details"
          className="min-h-11 min-w-11"
          ref={infoButton}
          onClick={() => {
            setDetailsOpen(true);
          }}
        >
          <Info />
        </Button>}
      </header>

      {isFields && (selectPointArmed || drawing.mode === "polygon" || drawing.mode === "edit") && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background px-3 py-2" role="group" aria-label={selectPointArmed ? "Point selection actions" : "Boundary drawing actions"}>
        <p className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">{selectPointArmed ? "Click the map to place a field point." : drawingMessage || "Draw or adjust the field boundary on the map."}</p>
        {selectPointArmed
          ? <Button className="min-h-11" variant="outline" onClick={() => { setSelectPointArmed(false); setDrawingMessage(""); }}>Cancel point selection</Button>
          : <div className="flex shrink-0 flex-wrap gap-2"><Button className="min-h-11" onClick={finishDrawing} disabled={!drawingReady || !mapReady}>Finish boundary</Button><Button className="min-h-11" variant="outline" onClick={() => { cancelField(); setDrawingMessage(""); }}>Cancel drawing</Button></div>}
      </div>}

      <div className="flex min-h-0 flex-1">
      {isFields && !isMobile && <MyFieldsPanel mapReady={mapReady} onSelectPoint={selectPoint} onDrawBoundary={drawBoundary} onSelectField={openField} onPlanField={planField} />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="map-stage relative min-h-0 min-w-0 flex-1 overflow-hidden" role="region" aria-label="Interactive field map">
        <MapCanvas
          {...settings}
          mode={isAtlas ? "atlas" : "field"}
          selection={isExplore ? selectedCounty && isAtlas ? {
            name: countyTitle, longitude: selectedCounty.centroid[0], latitude: selectedCounty.centroid[1],
          } : browseSelection : settings.selection}
          overlay={isAtlas ? "off" : settings.overlay}
          hexBrowse={isExplore && !isAtlas}
          drought={!isAtlas && !!settings.drought}
          basemapRetry={basemapRetry}
          droughtRetry={droughtRetry}
          onDroughtStatus={setDroughtStatus}
          atlasCells={isAtlas && layerMode==="returns" && atlas.data?.status === "available" && atlasCells.length ? atlasCells : undefined}
          regionalYield={regionalLayer??undefined}
          regionalYieldActive={isAtlas}
          onRegionalSelect={fips=> { setSelectedFips(fips??undefined); setMapOptionsOpen(false); setDetailsOpen(true); }}
          atlasSelectedH3={browseSelection.hexId}
          onAtlasHover={setAtlasHover}
          onAtlasRenderStatus={setAtlasRenderer}
          onBasemapStatus={setBasemapStatus}
          onSelect={select}
          onStatus={reportStatus}
          navigation={navigation}
          retry={retry}
          drawing={mapDrawing}
          onBoundaryChange={receiveBoundary}
          onDrawingStatus={setDrawingMessage}
          onMapReady={setMapReady}
          onDrawingReady={setDrawingReady}
        />
        {isFields && !selectPointArmed && drawing.mode === "browse" && fieldDraft && (
          <div className="absolute top-3 left-3 right-3 pointer-events-none">
            <Alert role="note" className="w-fit max-w-full">
              <AlertDescription>
                Unsaved field. Open details to save or cancel changes.
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div
          className="absolute right-3 bottom-16 flex flex-col gap-1 rounded-lg border bg-background p-1 shadow-xs"
          aria-label="Map navigation"
        >
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Zoom in"
            onClick={() => navigateMap("zoom-in")}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Zoom out"
            onClick={() => navigateMap("zoom-out")}
          >
            <Minus />
          </Button>
          <Separator />
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Reset map view"
            onClick={() => navigateMap("reset")}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>
      {isAtlas ? <ResearchMapFooter /> : <MapDataStatus status={status} droughtEnabled={!!settings.drought} droughtStatus={droughtStatus} onRetry={retryImagery} />}
      </div>
      {atlasRegion && detailsOpen && !isMobile && <aside className="flex w-[25rem] shrink-0 flex-col overflow-hidden border-l bg-background" aria-label="Region overview">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div><h2 className="text-lg font-semibold">{layerMode === "yield" ? countyTitle : countyTitle}</h2><p className="text-sm text-muted-foreground">{layerMode==="yield"?"Published county estimate":"National Atlas · Regional overview"}</p></div>
          <Button variant="ghost" size="icon" aria-label="Close region overview" onClick={() => { setDetailsOpen(false); infoButton.current?.focus(); }}><X /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {layerMode==="yield" ? <RegionalYieldDetails/>:<AtlasRegionOverview enabled={detailsOpen} />}
        </div>
        <footer className="flex shrink-0 flex-col gap-2 border-t p-4">
          <p className="text-xs text-muted-foreground">{layerMode==="yield"?"Choose a real field location in or near this county.":"Start at the centre, then select or draw your actual field."}</p>
          <Button onClick={inspectField} disabled={!selectedCounty}>Choose a field in this area</Button>
        </footer>
      </aside>}
      </div>

      <Sheet open={isExplore && !isAtlas && detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0" aria-label="Hexagon information">
          <SheetHeader className="shrink-0 border-b pr-12">
            <SheetTitle>Hexagon information</SheetTitle>
            <SheetDescription>Geographic cell and source-backed conditions at its centre.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><AtlasRegionOverview enabled={isExplore && !isAtlas && detailsOpen} geographyOnly selection={browseSelection} /></div>
          <div className="shrink-0 border-t p-4">
            <Button className="min-h-11 w-full" onClick={inspectField}>Choose a field in this area</Button>
            <p className="mt-2 text-xs text-muted-foreground">Select a field point or draw its boundary in My fields. The hexagon is not your field.</p>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={isAtlas && isMobile && detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0" aria-label="Historical research information">
          <SheetHeader className="shrink-0 border-b pr-12"><SheetTitle>{countyTitle}</SheetTitle><SheetDescription>Historical research at county scale.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><RegionalYieldDetails /></div>
        </SheetContent>
      </Sheet>
      <FieldDetails
        open={detailsOpen && isFields}
        onOpenChange={setDetailsOpen}
        onEditBoundary={() => {
          editField();
          setDrawingReady(false);
          setDetailsOpen(false);
          setDrawingMessage(
            "Preparing drawing tools…",
          );
        }}
        onAtlas={() => {
          requestTransition(() => { setDetailsOpen(false); router.push("/?view=research"); });
        }}
        onInspectField={inspectField}
      />
    </div>
    </AtlasContext.Provider>
  );
}
