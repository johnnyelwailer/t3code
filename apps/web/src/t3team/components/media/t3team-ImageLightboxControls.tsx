import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Minimize } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamLightboxZoom } from "./t3team-imageLightboxState";

const NAV_BUTTON_CLASS =
  "absolute top-1/2 z-10 -translate-y-1/2 bg-background/70 text-foreground backdrop-blur-sm hover:bg-background/90";

/** The two edge-anchored arrow buttons, shown only when the gallery has more than one image. */
export function T3TeamImageLightboxNav({
  onPrev,
  onNext,
}: {
  readonly onPrev: () => void;
  readonly onNext: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Previous image"
        className={cn(NAV_BUTTON_CLASS, "start-3")}
        onClick={onPrev}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Next image"
        className={cn(NAV_BUTTON_CLASS, "end-3")}
        onClick={onNext}
      >
        <ChevronRight />
      </Button>
    </>
  );
}

/** Bottom bar: zoom toggle, "open original" link, and a `2 / 5` position indicator. */
export function T3TeamImageLightboxToolbar({
  zoom,
  onToggleZoom,
  originalHref,
  positionLabel,
}: {
  readonly zoom: T3TeamLightboxZoom;
  readonly onToggleZoom: () => void;
  readonly originalHref: string;
  readonly positionLabel: string | undefined;
}) {
  return (
    <div className="relative z-10 flex items-center justify-center gap-2 bg-background/70 px-3 py-2 text-foreground backdrop-blur-sm">
      <Button type="button" variant="ghost" size="sm" onClick={onToggleZoom}>
        {zoom === "fit" ? <Maximize /> : <Minimize />}
        {zoom === "fit" ? "Actual size" : "Fit to screen"}
      </Button>
      <Button type="button" variant="ghost" size="sm" render={<a href={originalHref} target="_blank" rel="noreferrer" />}>
        <ExternalLink />
        Open original
      </Button>
      {positionLabel === undefined ? null : (
        <span className="ml-1 text-xs text-muted-foreground">{positionLabel}</span>
      )}
    </div>
  );
}
