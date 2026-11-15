import { Button } from "@/components/ui/button";
import { DROUGHT_DATASET, type DroughtStatus } from "@/lib/map/drought";
import type { MapStatus } from "@/lib/map/types";

export interface MapDataStatusProps {
  status: MapStatus;
  droughtEnabled: boolean;
  droughtStatus: DroughtStatus;
  onRetry: () => void;
}

function droughtMessage(status: DroughtStatus) {
  switch (status) {
    case "ready":
      return "Regional snapshot · legend in Map options";
    case "unavailable":
      return "Unavailable · retry in Map options";
    case "off":
      return "Layer is off";
    default:
      return "Loading regional assessment";
  }
}

export function MapDataStatus({
  status,
  droughtEnabled,
  droughtStatus,
  onRetry,
}: MapDataStatusProps) {
  const primaryMessage = status.failed || status.loading
    ? status.message
    : status.layer
      ? `${status.layer.label} · ${status.layer.date}${status.layer.units ? ` · ${status.layer.units}` : ""}`
      : status.message;

  if (!primaryMessage && !status.layer && !status.loading && !status.failed && !droughtEnabled) return null;

  return (
    <footer className="max-h-24 w-full shrink-0 overflow-y-auto border-t bg-background px-3 py-2 text-xs text-muted-foreground sm:px-4">
      <div aria-label="Map data status" role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 flex-1 break-words" title={primaryMessage}>{primaryMessage}</span>
          {status.layer && <span className="shrink-0 font-medium text-foreground">NASA GIBS</span>}
          {status.failed && (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="min-h-11 shrink-0 px-3"
            >
              Retry
            </Button>
          )}
        </div>
        {droughtEnabled && (
          <p className="min-w-0 break-words" title={DROUGHT_DATASET.attribution}>
            <span className="font-medium text-foreground">U.S. Drought Monitor · {DROUGHT_DATASET.asOf}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{droughtMessage(droughtStatus)}</span>
          </p>
        )}
      </div>
    </footer>
  );
}
