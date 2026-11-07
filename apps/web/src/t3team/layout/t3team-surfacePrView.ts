/**
 * The fork's pull-request detail view state (`t3team.pull-request-view`): the last tab
 * and focused file of a pull-request surface, riding on the upstream `pull-request`
 * surface. Parsing must reject torn or hostile persisted JSON; an absent view stays
 * absent rather than becoming a default.
 */
import {
  pullRequestDetailTabFromSearch,
  type PullRequestDetailTab,
} from "~/components/pullRequest/t3team-prDetailViewState.logic";

import { type T3TeamForkSurfaceParams } from "./t3team-surfaceRegistry";

/** The `t3team`-namespace kind of the view-state entry. */
export const T3_TEAM_PULL_REQUEST_VIEW_KIND = "t3team.pull-request-view" as const;

/** The detail panel view a pull-request surface remembers. */
export interface PullRequestSurfaceView {
  readonly tab: PullRequestDetailTab;
  readonly file: string | null;
  readonly commit: string | null;
}

/** The entry's params: the surface the view rides on, and the view itself. */
export interface T3TeamPrViewParams extends T3TeamForkSurfaceParams {
  readonly surfaceId: string;
  readonly view: PullRequestSurfaceView;
}

/** The pull-request surface id the view state rides on. */
export function t3TeamPrViewIdOf(params: T3TeamPrViewParams): string {
  return params.surfaceId;
}

/**
 * Coerces a persisted view back into shape; undefined when there is no view to read. The
 * store keeps an absent view absent through the storage migration.
 */
export function parsePullRequestSurfaceView(raw: unknown): PullRequestSurfaceView | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  return {
    tab: pullRequestDetailTabFromSearch(candidate.tab) ?? "summary",
    file: typeof candidate.file === "string" ? candidate.file : null,
    commit: typeof candidate.commit === "string" ? candidate.commit : null,
  };
}

/** Serializes a view to its JSON-safe stored form. */
export function serializePullRequestSurfaceView(view: PullRequestSurfaceView): {
  readonly tab: PullRequestDetailTab;
  readonly file: string | null;
  readonly commit: string | null;
} {
  return { tab: view.tab, file: view.file, commit: view.commit };
}

/** Validates the entry's params; null when no surface is named or the view is absent. */
export function t3TeamPrViewParams(raw: unknown): T3TeamPrViewParams | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.surfaceId !== "string" || record.surfaceId === "") return null;
  const view = parsePullRequestSurfaceView(record.view);
  if (view === undefined) return null;
  return { surfaceId: record.surfaceId, view };
}

/**
 * Whether a reported view is the one already stored: a view the panel reports on every
 * mount is the one already stored, and writing it back would only churn the surfaces
 * array for no change.
 */
export function pullRequestSurfaceViewEqual(
  previous: PullRequestSurfaceView | undefined,
  next: PullRequestSurfaceView,
): boolean {
  return (
    previous !== undefined &&
    previous.tab === next.tab &&
    previous.file === next.file &&
    previous.commit === next.commit
  );
}
