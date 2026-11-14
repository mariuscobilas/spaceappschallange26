"use client";

import { FieldDetails } from "@/components/map/FieldDetails";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { FieldContext } from "@/components/workspace/FieldContext";
import { AtlasRegionOverview } from "@/components/map/AtlasRegionOverview";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { today, validDate } from "@/lib/workspace";
import type {
  MapMode,
  Overlay,
  Selection,
  TimeMode,
} from "@/lib/map/types";

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
    editField,
    receiveBoundary,
    finishDrawing,
    cancelField,
    requestTransition,
  } = useMeridian();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isMobile = useIsMobile();
  const infoButton = useRef<HTMLButtonElement>(null);
  const atlasRegion = settings.mode === "atlas" && !fieldDraft;
  const [mapReady, setMapReady] = useState(false);
  const [drawingReady, setDrawingReady] = useState(false);
  const [drawingMessage, setDrawingMessage] = useState("");
  useEffect(() => {
    if (fieldDraft?.boundary && drawing.mode === "browse") setDetailsOpen(true);
  }, [fieldDraft?.boundary, drawing.mode]);
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") setDetailsOpen(false);
  }, [pathname]);
  const select = (selection: Selection) =>
    requestTransition(() => {
      if (settings.mode === "field") beginField(selection);
      else {
        if (fieldDraft) cancelField();
        selectLocation(selection);
      }
      setDetailsOpen(true);
    });
  const layer = layers.find((l) => l.value === settings.overlay);
  const showStatus =
    status.loading || status.failed || !!status.message || !!status.layer;
  const inspectField = () => requestTransition(() => {
    const hex = settings.selection.hexId;
    const [latitude, longitude] = hex && isValidCell(hex)
      ? cellToLatLng(hex) : [settings.selection.latitude, settings.selection.longitude];
    change("mode", "field");
    beginField({ name: "Selected point", latitude, longitude });
    navigateMap("selection");
  });

  return (
    <div
      className="workspace-map flex h-full min-h-0 flex-col"
      aria-label="Explore workspace"
    >
      <header
        className="map-toolbar flex shrink-0 flex-wrap items-end gap-2 border-b bg-background px-3 py-3"
        aria-label="Map toolbar"
      >
        <SidebarTrigger aria-label="Toggle navigation" size="icon" />
        <h1 className="sr-only">Explore</h1>
        {pathname === "/" && <FieldContext />}
        <Field className="w-auto">
        <FieldLabel id="map-mode-label" className="text-xs text-muted-foreground">Map view</FieldLabel>
        <ToggleGroup
          aria-labelledby="map-mode-label"
          aria-label="Map mode"
          variant="outline"
          value={[settings.mode]}
          onValueChange={(v) => {
            if (v[0])
              requestTransition(() => {
                if (fieldDraft) cancelField();
                change("mode", v[0] as MapMode);
              });
          }}
          spacing={0}
        >
          <ToggleGroupItem value="field" aria-label="Field Simulator">
            Field
          </ToggleGroupItem>
          <ToggleGroupItem value="atlas" aria-label="National Risk Atlas">
            Atlas
          </ToggleGroupItem>
        </ToggleGroup>
        </Field>
        <Field className="w-auto">
        <FieldLabel id="map-tools-label" className="text-xs text-muted-foreground">Field tools</FieldLabel>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="map-tools-label">
        {drawing.mode === "polygon" || drawing.mode === "edit" ? (
          <>
            <Button onClick={finishDrawing} disabled={!drawingReady || !mapReady}>Finish boundary</Button>
            <Button
              variant="outline"
              onClick={() => {
                cancelField();
                setDrawingMessage("");
              }}
            >
              Cancel drawing
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={!mapReady}
              onClick={() =>
                requestTransition(() => {
                  change("mode", "field");
                  setDrawingMessage(
                    "Click the map to select an exact field point.",
                  );
                  setDetailsOpen(false);
                })
              }
            >
              Select point
            </Button>
            <Button
              variant="outline"
              disabled={!mapReady}
              onClick={() =>
                requestTransition(() => {
                  change("mode", "field");
                  beginField(undefined, true);
                  setDrawingReady(false);
                  setDetailsOpen(false);
                  setDrawingMessage(
                    "Preparing drawing tools…",
                  );
                })
              }
            >
              Draw boundary
            </Button>
          </>
        )}
        </div>
        </Field>
        <Field className="w-auto">
        <FieldLabel htmlFor="map-layers" className="text-xs text-muted-foreground">Map layer</FieldLabel>
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" />}
            aria-label="Layers"
            id="map-layers"
          >
            <Layers3 data-icon="inline-start" />
            {layer?.short ?? "Conditions"}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 max-w-[calc(100vw-24px)]"
          >
            <PopoverHeader>
              <PopoverTitle>Map conditions</PopoverTitle>
              <PopoverDescription>
                Choose a NASA observation to explore.
              </PopoverDescription>
            </PopoverHeader>
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
                {status.layer && !status.failed && !status.loading && (
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span>
                      Observed {status.layer.date} · {status.layer.units}
                    </span>
                    {status.layer.legend && (
                      <img
                        src={status.layer.legend}
                        alt={`${status.layer.label} data legend`}
                        className="h-14 w-full object-contain object-left"
                      />
                    )}
                    <span>NASA GIBS</span>
                  </div>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>
        </Field>
        <FieldGroup className="ml-auto">
          <Field className="w-40">
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
            <Field className="w-36">
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Selected location details"
          ref={infoButton}
          onClick={() => {
            if (settings.mode === "field" && !fieldDraft && !activeField)
              beginField();
            setDetailsOpen(true);
          }}
        >
          <Info />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
      <section
        className="map-stage relative min-h-0 min-w-0 flex-1 overflow-hidden"
        aria-label="Interactive field map"
      >
        <MapCanvas
          {...settings}
          onSelect={select}
          onStatus={reportStatus}
          navigation={navigation}
          retry={retry}
          drawing={drawing}
          onBoundaryChange={receiveBoundary}
          onDrawingStatus={setDrawingMessage}
          onMapReady={setMapReady}
          onDrawingReady={setDrawingReady}
        />
        {(drawingMessage || fieldDraft) && (
          <div className="absolute top-3 left-3 right-3 pointer-events-none">
            <Alert role="note" className="w-fit max-w-full">
              <AlertDescription>
                {drawing.mode === "polygon" || drawing.mode === "edit"
                  ? drawingMessage
                  : fieldDraft
                    ? "Unsaved field. Open details to save or cancel changes."
                    : drawingMessage}
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
        {showStatus && (
          <div className="absolute bottom-6 left-3 max-w-[calc(100%-90px)]">
            <Alert
              role="status"
              aria-live="polite"
              aria-atomic="true"
              variant={status.failed ? "destructive" : "default"}
              className="w-fit shadow-xs"
            >
              <AlertDescription>
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {status.failed || status.loading
                      ? status.message
                      : status.layer
                        ? `${status.layer.date} · ${status.layer.label}`
                        : status.message}
                  </span>
                  {status.failed && (
                    <Button variant="outline" size="sm" onClick={retryImagery}>
                      Retry
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {settings.overlay !== "off" && (
          <span className="absolute right-2 bottom-7 bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground">
            NASA GIBS
          </span>
        )}
      </section>
      {atlasRegion && detailsOpen && !isMobile && <aside className="flex w-[25rem] shrink-0 flex-col overflow-hidden border-l bg-background" aria-label="Region overview">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">{settings.selection.name}</h2>
            <p className="text-sm text-muted-foreground">National Atlas · Regional overview</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close region overview" onClick={() => { setDetailsOpen(false); infoButton.current?.focus(); }}><X /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AtlasRegionOverview enabled={detailsOpen} />
        </div>
        <footer className="flex shrink-0 flex-col gap-2 border-t p-4">
          <p className="text-xs text-muted-foreground">Start at the centre, then select or draw your actual field.</p>
          <Button onClick={inspectField} disabled={!settings.selection.hexId}>Inspect field here</Button>
        </footer>
      </aside>}
      </div>

      <FieldDetails
        open={detailsOpen && (!atlasRegion || isMobile)}
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
          change("mode", "atlas");
          setDetailsOpen(false);
        }}
        onInspectField={inspectField}
      />
    </div>
  );
}
