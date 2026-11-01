/**
 * The first tab of a `RightPanelTabs` host that owns a permanent tab (the context chat's Chat
 * tab). It is not a surface: it is active while no surface is, has no close button and is
 * not part of the sortable list, so it can be neither closed, dragged nor saved as a closed view.
 */
import type { ComponentType } from "react";

import { cn } from "~/lib/utils";

export interface PinnedPanelTabProps {
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** Select the tab; the host usually calls the store's `activatePinned`. */
  readonly onActivate: () => void;
}

export function PinnedPanelTab(props: {
  readonly pinned: PinnedPanelTabProps;
  readonly active: boolean;
  readonly ownsDesktopTitleBar: boolean;
}) {
  const Icon = props.pinned.icon;
  return (
    <button
      type="button"
      data-pinned-tab
      data-active-tab={props.active}
      aria-pressed={props.active}
      onClick={props.pinned.onActivate}
      className={cn(
        "cursor-pointer flex h-6 max-w-36 shrink-0 items-center gap-1 rounded-md pr-2 pl-1.5 text-xs",
        props.ownsDesktopTitleBar && "[-webkit-app-region:no-drag]",
        props.active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{props.pinned.label}</span>
    </button>
  );
}
