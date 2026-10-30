import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { useMemo } from "react";

import { mobileExtensions } from "./t3team-extensions";
import {
  NO_PENDING_DRAFTS,
  placeholderProject,
  withPlaceholderProject,
} from "./t3team-pendingDraft";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/** The distribution's pending drafts by draft key; none in a stock build. The slot is fixed for the process. */
export function usePendingDrafts(): ReadonlyMap<string, PendingDraft> {
  const slot = mobileExtensions.pendingDraft;
  return slot ? slot.usePendingDrafts() : NO_PENDING_DRAFTS;
}

export function usePendingDraft(draftKey: string | null): PendingDraft | null {
  const drafts = usePendingDrafts();
  return draftKey === null ? null : (drafts.get(draftKey) ?? null);
}

/**
 * The flow's project list: the catalog, plus a placeholder for the route draft's pending project
 * so a draft can open before its environment exists. Without a pending draft it is the catalog.
 */
export function usePendingDraftProjects(
  catalog: ReadonlyArray<EnvironmentProject>,
  routeDraftId: string | undefined,
): { readonly projects: ReadonlyArray<EnvironmentProject>; readonly pendingDraft: PendingDraft | null } {
  const pendingDraft = usePendingDraft(routeDraftId ?? null);
  const project = pendingDraft?.project;
  const environmentId = project?.environmentId;
  const id = project?.id;
  const title = project?.title;
  const workspaceRoot = project?.workspaceRoot;
  const placeholder = useMemo(
    () =>
      environmentId === undefined || id === undefined || title === undefined
        ? null
        : placeholderProject({ environmentId, id, title, workspaceRoot }),
    [environmentId, id, title, workspaceRoot],
  );
  const projects = useMemo(() => withPlaceholderProject(catalog, placeholder), [catalog, placeholder]);
  return { projects, pendingDraft };
}
