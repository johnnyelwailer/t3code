import { useLocation, useRouter } from "@tanstack/react-router";
import { PictureInPicture2Icon } from "lucide-react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "~/components/CommandPalette.logic";

import { DETACH_SURFACE_LABEL } from "./t3team-openDetachedSurface";
import { UNDOCK_VIEW_COMMAND } from "./t3team-UndockViewControls";
import { canUndockViews, undockView, undockViewTitle } from "./t3team-undockView";

/** The command palette's "Open in new window" for the view behind the palette, when it undocks. */
export function useUndockViewPaletteAction(): CommandPaletteActionItem | null {
  const router = useRouter();
  const viewTitle = useLocation({
    select: (location) =>
      undockViewTitle({ pathname: location.pathname, searchStr: location.searchStr }),
  });
  if (viewTitle === null || !canUndockViews()) return null;
  return {
    kind: "action",
    value: "action:open-view-in-new-window",
    searchTerms: ["open", "new", "window", "tab", "undock", "detach", "pop out", viewTitle],
    title: `${DETACH_SURFACE_LABEL}: ${viewTitle}`,
    icon: <PictureInPicture2Icon className={ITEM_ICON_CLASS} />,
    shortcutCommand: UNDOCK_VIEW_COMMAND,
    run: async () => {
      undockView(router.state.location);
    },
  };
}
