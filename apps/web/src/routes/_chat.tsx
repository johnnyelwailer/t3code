import { AuthPreviewOperateScope } from "@t3tools/contracts";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { ThreadRouteView } from "../components/ThreadRouteView";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { isPreviewAvailableFor } from "../browser/previewRuntime";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentScope } from "../state/session";
import { dispatchPreviewAction } from "../components/preview/previewActionBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useScratchProject } from "../hooks/useScratchProject";
import { startNewThreadFromContext } from "../lib/chatThreadActions";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isEditableFocused } from "../lib/editableFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { readThreadShells } from "../state/entities";
import { translateUpstreamPath } from "../t3team/t3team-upstreamRouteBridge";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { useT3TeamAppBaseName } from "~/t3team/t3team-appBrandName";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";

function ChatRouteGlobalShortcuts() {
  const appName = useT3TeamAppBaseName();
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadKeysSize = useThreadSelectionStore((state) => state.selectedThreadKeys.size);
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread, routeThreadRef } =
    useHandleNewThread();
  const canOperatePreview = useEnvironmentScope(
    routeThreadRef?.environmentId ?? null,
    AuthPreviewOperateScope,
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  // t3team: `chat.new` is collapsed into the contextual create below (no "new-thread-in" palette
  // detour in the Team shell), so only upstream's scratch-thread inputs are needed here.
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const terminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  // This flag is store-only; dispatch the action bus to reuse ChatView's URL-aware arbitration.
  const previewOpen = useRightPanelStore((state) =>
    routeThreadRef
      ? selectActiveRightPanel(state.byThreadKey, routeThreadRef) === "preview"
      : false,
  );
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
          previewFocus: isPreviewFocused(),
          previewOpen,
          editableFocus: isEditableFocused(event.target),
          modelPickerOpen: isModelPickerOpen(),
        },
      });

      if (isCommandPaletteOpen()) {
        return;
      }

      if (event.key === "Escape" && selectedThreadKeysSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (command === "chat.new" || command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void startNewThreadFromContext({
          activeDraftThread,
          activeThread: activeThread ?? undefined,
          defaultProjectRef,
          handleNewThread,
        });
        return;
      }

      if (command === "chat.newWithoutProject") {
        const environmentId = scratchEnvironmentId(
          activeThread?.environmentId ?? activeDraftThread?.environmentId ?? primaryEnvironmentId,
        );
        if (environmentId === null) return;
        event.preventDefault();
        event.stopPropagation();
        void startScratchThread(environmentId);
        return;
      }

      if (command === "preview.toggle") {
        event.preventDefault();
        event.stopPropagation();
        if (!routeThreadRef || (!canOperatePreview && !previewOpen)) return;
        if (!isPreviewAvailableFor(routeThreadRef.environmentId)) {
          toastManager.add(
            stackedThreadToast({
              type: "info",
              title: "Preview is desktop-only",
              description: `Open ${appName} in the desktop app to use the in-app preview.`,
            }),
          );
          return;
        }
        dispatchPreviewAction("toggle-panel");
        return;
      }

      if (
        command === "preview.refresh" ||
        command === "preview.focusUrl" ||
        command === "preview.zoomIn" ||
        command === "preview.zoomOut" ||
        command === "preview.resetZoom"
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!canOperatePreview) return;
        const action =
          command === "preview.refresh"
            ? "refresh"
            : command === "preview.focusUrl"
              ? "focus-url"
              : command === "preview.zoomIn"
                ? "zoom-in"
                : command === "preview.zoomOut"
                  ? "zoom-out"
                  : "reset-zoom";
        dispatchPreviewAction(action);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    appName,
    clearSelection,
    canOperatePreview,
    handleNewThread,
    keybindings,
    defaultProjectRef,
    previewOpen,
    primaryEnvironmentId,
    routeThreadRef,
    scratchEnvironmentId,
    selectedThreadKeysSize,
    startScratchThread,
    terminalOpen,
  ]);

  return null;
}

function ChatRouteLayout() {
  // Render both routes here so draft promotion keeps the same ChatView mounted.
  const threadTarget = useThreadRouteTarget();
  return (
    <>
      <ChatRouteGlobalShortcuts />
      {threadTarget?.kind === "server" ? (
        <ThreadLinkPrompt threadRef={threadTarget.threadRef} />
      ) : null}
      {threadTarget ? <ThreadRouteView target={threadTarget} /> : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }

    // T3 Team is the permanent shell: upstream's sidebar navigates with upstream's route shapes, all of
    // which live under this layout route. Resolving the Team route here, synchronously before this route
    // commits, avoids the reactive bridge (__root.tsx), which mounts this route then bounces away,
    // unmounting the Team shell for a frame and resetting component-local sidebar state.
    const translation = translateUpstreamPath(location.pathname, {
      resolveProjectIdForThread: ({ environmentId, threadId }) =>
        readThreadShells().find(
          (shell) => shell.id === threadId && shell.environmentId === environmentId,
        )?.projectId ??
        // Deep links can arrive before the environment id is known locally; a
        // unique thread id is still enough to place the thread.
        readThreadShells().find((shell) => shell.id === threadId)?.projectId ??
        null,
      primaryEnvironmentId: appAtomRegistry.get(primaryEnvironmentIdAtom),
      // Environment discovery is never settled this early; the reactive bridge decides whether a
      // non-primary environment is really absent.
      knownEnvironmentIds: null,
    });
    if (translation.kind === "target") {
      throw redirect(translation.target);
    }
    if (translation.kind === "unhandled") {
      // t3team: the unhandled path is a race, not a bad link: both segments are known, but
      // resolveProjectIdForThread misses while this environment's thread shells are still syncing into
      // the entities store (readThreadShells() is a synchronous snapshot), so projectId is null. A plain
      // redirect is safe because projectScopeKey is persisted in sessionStorage (see Sidebar.tsx).
      throw redirect({ to: "/t3team" });
    }
  },
  component: ChatRouteLayout,
});
