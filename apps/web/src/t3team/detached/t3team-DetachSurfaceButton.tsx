/**
 * The control that moves a surface into a window (desktop) or tab (web) of its own. Any panel
 * that can describe itself as a {@link DetachedSurfaceRequest} can carry one; inside a window
 * that is already detached it renders nothing, since there is nowhere further to go.
 */
import { PictureInPicture2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import {
  DETACH_SURFACE_LABEL,
  isDetachedSurfaceWindow,
  openDetachedSurface,
  type DetachedSurfaceRequest,
} from "./t3team-openDetachedSurface";

export function DetachSurfaceButton({
  request,
  className,
}: {
  /** Built on click, so a request that reads live state (the focused file) is never stale. */
  readonly request: () => DetachedSurfaceRequest | null;
  readonly className?: string;
}) {
  if (isDetachedSurfaceWindow()) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={DETACH_SURFACE_LABEL}
            className={cn("shrink-0", className)}
            onClick={() => {
              const next = request();
              if (next !== null) openDetachedSurface(next);
            }}
          />
        }
      >
        <PictureInPicture2Icon aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{DETACH_SURFACE_LABEL}</TooltipPopup>
    </Tooltip>
  );
}
