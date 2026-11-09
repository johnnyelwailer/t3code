/**
 * The real right panel of a thread, on the real panel store: upstream's `RightPanelTabs` chrome
 * with the Team view tab as its body. Side-chat tabs show their real tab chrome; their body needs
 * a live server, so the stories keep a view tab active.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useState, type ReactNode } from "react";

import { RightPanelTabs } from "~/components/RightPanelTabs";
import {
  selectSelectedRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "~/rightPanelStore";
import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { viewTabAddActions } from "~/t3team/t3team-useViewTabAddActions";
import { ViewTabProjectsProvider } from "~/t3team/t3team-useViewTabProject";
import T3TeamViewSurface from "~/t3team/t3team-ViewSurface";

import {
  STORY_ENVIRONMENT_ID,
  STORY_THREAD_REF,
  TICKET_4711,
} from "./t3team-viewTabsStoryFixtures";

const NO_PENDING = new Set<string>();
const NO_TERMINAL_LABELS = new Map<string, string>();
const STORY_SHORTCUT_CONTEXT = () => ({
  terminalFocus: false,
  terminalOpen: false,
  previewFocus: false,
  previewOpen: false,
  isWeb: true,
  isDesktop: false,
});
const ignore = () => undefined;

function seedPanel(surfaces: ReadonlyArray<RightPanelSurface>, activeSurfaceId: string) {
  useRightPanelStore.setState((state) => ({
    byThreadKey: {
      ...state.byThreadKey,
      [scopedThreadKey(STORY_THREAD_REF)]: {
        isOpen: true,
        activeSurfaceId,
        surfaces: [...surfaces],
      },
    },
  }));
}

function PanelBody() {
  const active = useRightPanelStore((state) =>
    selectSelectedRightPanelSurface(state.byThreadKey, STORY_THREAD_REF),
  );
  if (active?.kind !== "view") {
    return <p className="p-6 text-sm text-muted-foreground">Side chats need a live server.</p>;
  }
  return <T3TeamViewSurface threadRef={STORY_THREAD_REF} surface={active} visible />;
}

function StoryRightPanel({ projectId }: { readonly projectId: string }) {
  const surfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, STORY_THREAD_REF).surfaces,
  );
  const active = useRightPanelStore((state) =>
    selectSelectedRightPanelSurface(state.byThreadKey, STORY_THREAD_REF),
  );
  const addActions = viewTabAddActions({
    source: { projectId, ticketId: TICKET_4711.id, ticketDisplayId: TICKET_4711.displayId },
    ticketTitle: TICKET_4711.title,
    open: (target) => useRightPanelStore.getState().openView(STORY_THREAD_REF, target),
  });
  return (
    <RightPanelTabs
      mode="embedded"
      keybindings={[]}
      getShortcutContext={STORY_SHORTCUT_CONTEXT}
      surfaces={surfaces}
      environmentId={STORY_ENVIRONMENT_ID}
      activeSurfaceId={active?.id ?? null}
      pendingSurfaceIds={NO_PENDING}
      previewSessions={{}}
      desktopByTabId={{}}
      terminalLabelsById={NO_TERMINAL_LABELS}
      onActivate={(surface) =>
        useRightPanelStore.getState().activateSurface(STORY_THREAD_REF, surface.id)
      }
      onCloseSurface={(surface) =>
        useRightPanelStore.getState().closeSurface(STORY_THREAD_REF, surface.id)
      }
      onCloseOtherSurfaces={(surface) =>
        useRightPanelStore.getState().closeOtherSurfaces(STORY_THREAD_REF, surface.id)
      }
      onCloseSurfacesToRight={(surface) =>
        useRightPanelStore.getState().closeSurfacesToRight(STORY_THREAD_REF, surface.id)
      }
      onCloseAllSurfaces={() => useRightPanelStore.getState().closeAllSurfaces(STORY_THREAD_REF)}
      onCopyFilePath={ignore}
      onAddBrowser={ignore}
      onAddBrowserInProfile={ignore}
      onAddTerminal={ignore}
      onAddDiff={ignore}
      onAddFiles={ignore}
      onAddPullRequest={ignore}
      onAddPullRequests={ignore}
      onAddDevice={ignore}
      browserAvailable={false}
      terminalAvailable={false}
      diffAvailable={false}
      filesAvailable={false}
      pullRequestAvailable={false}
      pullRequestsAvailable={false}
      deviceAvailable={false}
      t3teamAddSurfaceActions={addActions}
    >
      <PanelBody />
    </RightPanelTabs>
  );
}

/** A thread's panel at `width`, seeded once with `surfaces`, its data answered by `backend`. */
export function ViewTabsStoryPanel(props: {
  readonly backend: BackendApi;
  readonly projects: ReadonlyArray<ProjectShellProject>;
  /** The thread's own project: what the "+" menu offers as My Work. */
  readonly projectId: string;
  readonly surfaces: ReadonlyArray<RightPanelSurface>;
  readonly activeSurfaceId: string;
  readonly width: number;
  readonly caption?: ReactNode;
}) {
  useState(() => seedPanel(props.surfaces, props.activeSurfaceId));
  return (
    <div className="flex min-h-screen flex-col gap-3 bg-muted/30 p-4 text-foreground">
      {props.caption ? <p className="text-xs text-muted-foreground">{props.caption}</p> : null}
      <div
        className="flex h-[760px] overflow-hidden rounded-lg border border-border bg-background"
        style={{ width: props.width }}
      >
        <BackendProvider backend={props.backend}>
          <ViewTabProjectsProvider value={props.projects}>
            <StoryRightPanel projectId={props.projectId} />
          </ViewTabProjectsProvider>
        </BackendProvider>
      </div>
    </div>
  );
}
