import {
  CheckCheckIcon,
  ListIcon,
  ListTreeIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { PrTreeDockSide } from "./t3team-prCodeTreeDock.logic";

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

export interface DiffExplorerTreeHeaderProps {
  readonly accessoryOnly?: boolean;
  readonly fileCount: number;
  readonly viewedCount: number;
  readonly showFullPaths: boolean;
  readonly onToggleFullPaths: () => void;
  readonly onMarkAllViewed: () => void;
  readonly side: PrTreeDockSide;
  readonly onSwapSide: () => void;
}

/**
 * The tree pane's title bar: how much of the change is viewed, plus the controls for how the
 * files are listed and where the pane sits.
 */
export function DiffExplorerTreeHeader({
  accessoryOnly = false,
  fileCount,
  viewedCount,
  showFullPaths,
  onToggleFullPaths,
  onMarkAllViewed,
  side,
  onSwapSide,
}: DiffExplorerTreeHeaderProps) {
  const targetSide = side === "left" ? "right" : "left";
  return (
    <div
      className={
        accessoryOnly
          ? "contents"
          : "flex h-10 min-h-10 shrink-0 items-center gap-0.5 border-b border-border/60 px-2 text-xs text-muted-foreground"
      }
      data-surface-subheader
    >
      {accessoryOnly ? null : (
        <>
          <span className="px-1 font-medium text-foreground">Files</span>
          <span className="tabular-nums">{fileCount}</span>
        </>
      )}
      <span className="ml-auto min-w-0 truncate pr-1 tabular-nums text-2xs">
        {viewedCount}/{fileCount} viewed
      </span>
      <HeaderButton
        label={showFullPaths ? "Show as folders" : "Show full file paths"}
        onClick={onToggleFullPaths}
      >
        {showFullPaths ? <ListTreeIcon className="size-3.5" /> : <ListIcon className="size-3.5" />}
      </HeaderButton>
      <HeaderButton label="Mark all as viewed" onClick={onMarkAllViewed}>
        <CheckCheckIcon className="size-3.5" />
      </HeaderButton>
      <HeaderButton label={`Dock file tree on the ${targetSide}`} onClick={onSwapSide}>
        {side === "left" ? (
          <PanelRightIcon className="size-3.5" />
        ) : (
          <PanelLeftIcon className="size-3.5" />
        )}
      </HeaderButton>
    </div>
  );
}
