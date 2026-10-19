/**
 * The controls that undock the current routed view: a header button, and the
 * `view.openInNewWindow` shortcut (mounted once, in the main window's shell). Both read the
 * router's location when used, so they always open the view the reader is on now.
 */
import { useAtomValue } from "@effect/atom-react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { resolveShortcutCommand } from "~/keybindings";
import { isEditableFocused } from "~/lib/editableFocus";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { primaryServerKeybindingsAtom } from "~/state/server";

import { DetachSurfaceButton } from "./t3team-DetachSurfaceButton";
import { canUndockViews, undockView, undockViewRequest } from "./t3team-undockView";

export const UNDOCK_VIEW_COMMAND = "view.openInNewWindow";

/** "Open in new window" for the view the header belongs to; nothing where the view stays put. */
export function UndockViewButton({ className }: { readonly className?: string }) {
  const router = useRouter();
  const undockable = useLocation({
    select: (location) =>
      undockViewRequest({ pathname: location.pathname, searchStr: location.searchStr }) !== null,
  });
  if (!undockable || !canUndockViews()) return null;
  return (
    <DetachSurfaceButton
      {...(className === undefined ? {} : { className })}
      request={() => undockViewRequest(router.state.location)}
    />
  );
}

export function UndockViewShortcut() {
  const router = useRouter();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isCommandPaletteOpen() ||
        (event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]"))
      )
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          editableFocus: isEditableFocused(event.target),
        },
      });
      if (command !== UNDOCK_VIEW_COMMAND) return;
      if (!undockView(router.state.location)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, router]);
  return null;
}
