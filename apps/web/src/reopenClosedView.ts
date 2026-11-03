import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type { OpenPreviewMutation } from "./browser/openFileInPreview";
import type { ClosedView, ClosedViewEntry } from "./closedViewStore";
import {
  PullRequestListSort,
  type PullRequestListPreferencePatch,
} from "./components/pullRequest/pullRequestListPreferences";
import { openPreviewSession } from "./components/preview/openPreviewSession";
import type { PullRequestsSearch } from "./components/pullRequest/usePullRequestListView";
import {
  type RightPanelSurface,
  type ThreadRightPanelState,
  useRightPanelStore,
} from "./rightPanelStore";

const isPullRequestListSort = Schema.is(PullRequestListSort);

export interface ReopenOwnerState {
  environmentKnown: boolean;
  catalogReady: boolean;
  ownerExists: boolean;
  /** False only for a side chat tab whose thread is gone from the shell. */
  sideChatExists: boolean;
  shellLive: boolean;
  panel: ThreadRightPanelState;
}

export function planNextReopen(
  entries: readonly ClosedViewEntry[],
  ownerState: (entry: ClosedViewEntry) => ReopenOwnerState,
): { drop: ClosedViewEntry[]; restore: ClosedViewEntry | null } {
  const drop: ClosedViewEntry[] = [];
  for (const entry of entries) {
    const owner = ownerState(entry);
    if (!owner.environmentKnown) {
      if (!owner.catalogReady) break;
      drop.push(entry);
      continue;
    }
    if (!owner.ownerExists || !owner.sideChatExists) {
      if (owner.shellLive) continue;
      break;
    }
    const alreadyOpen =
      entry.kind === "panel-tab"
        ? owner.panel.isOpen && owner.panel.surfaces.some((s) => s.id === entry.surface.id)
        : owner.panel.surfaces.some(
            (s) => s.kind === "preview" && s.resourceId === entry.snapshot.tabId,
          );
    if (alreadyOpen) {
      drop.push(entry);
      continue;
    }
    return { drop, restore: entry };
  }
  return { drop, restore: null };
}

type PullRequestsSearchLike = Omit<PullRequestListPreferencePatch, "labels" | "sort"> & {
  repository?: string | undefined;
  number?: number | undefined;
  selectedProjectId?: ProjectId | undefined;
  selectedHost?: string | undefined;
  selectedEnvironmentId?: EnvironmentId | undefined;
  // A navigate() not anchored to this route widens `previous` to every route's search schema;
  // the backlog view's own `labels`/`sort` filters are shaped differently from the PR list's.
  labels?: string | readonly string[] | undefined;
  sort?: string | undefined;
};

export function pullRequestsSearchForRestore<S extends PullRequestsSearchLike>(
  previous: S,
  selected: RightPanelSurface | null,
): PullRequestsSearch {
  const {
    repository: _repository,
    number: _number,
    selectedProjectId: _projectId,
    selectedHost: _host,
    selectedEnvironmentId: _environmentId,
    labels: previousLabels,
    sort: previousSort,
    ...filters
  } = previous;
  return {
    ...filters,
    involvement: previous.involvement ?? "all",
    state: previous.state ?? "open",
    ...(Array.isArray(previousLabels) ? { labels: previousLabels } : {}),
    ...(isPullRequestListSort(previousSort) ? { sort: previousSort } : {}),
    ...(selected?.kind === "pull-request"
      ? {
          repository: selected.repository,
          number: selected.number,
          selectedProjectId: selected.projectId as ProjectId,
          ...(selected.host === undefined ? {} : { selectedHost: selected.host }),
          ...(selected.environmentId === undefined
            ? {}
            : { selectedEnvironmentId: selected.environmentId as EnvironmentId }),
        }
      : {}),
  } as PullRequestsSearch;
}

export async function reopenClosedView(
  view: ClosedView,
  options: {
    openPreview: OpenPreviewMutation;
    workspaceAvailable: boolean;
  },
): Promise<boolean> {
  const panels = useRightPanelStore.getState();
  const ref = view.threadRef;

  if (view.kind === "browser") {
    const url = view.snapshot.navStatus._tag === "Idle" ? undefined : view.snapshot.navStatus.url;
    const result = await openPreviewSession({
      openPreview: options.openPreview,
      threadRef: ref,
      ...(url === undefined ? {} : { url }),
      ...(view.snapshot.viewport === undefined ? {} : { viewport: view.snapshot.viewport }),
      ...(view.snapshot.profileId === undefined ? {} : { profileId: view.snapshot.profileId }),
    });
    if (result._tag === "Failure") return false;
    panels.openBrowser(ref, result.value.tabId);
    return true;
  }
  const surface = view.surface;
  if (
    !options.workspaceAvailable &&
    (surface.kind === "files" || (surface.kind === "file" && !surface.attachment))
  )
    return false;
  switch (surface.kind) {
    case "preview":
      if (surface.resourceId !== null) return false;
      panels.openBrowser(ref, null);
      break;
    case "file":
      if (surface.attachment) panels.openAttachment(ref, surface.attachment);
      else panels.openFile(ref, surface.relativePath, surface.revealLine ?? undefined);
      break;
    case "device":
      if (surface.target) {
        panels.openDevice(ref, surface.target);
        if (surface.title) panels.renameDevice(ref, surface.id, surface.title);
      } else panels.open(ref, "device");
      break;
    case "pull-request":
      panels.openPullRequest(ref, surface);
      break;
    case "thread":
      // t3team: side-chat (thread) surfaces are not reopenable yet — open question for Phil
      return false;
    case "side-chat":
      panels.openSideChat(ref, surface.threadId);
      break;
    default:
      panels.open(ref, surface.kind);
  }
  return true;
}
