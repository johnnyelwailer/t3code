import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { NewTaskFlowState } from "../features/threads/new-task-flow-state";
import { scopedProjectKey } from "../lib/scopedEntities";

import type { PendingDraft, PendingDraftProject } from "./t3team-pendingDraftTypes";

export const NO_PENDING_DRAFTS: ReadonlyMap<string, PendingDraft> = new Map();

const PLACEHOLDER_TIME = "1970-01-01T00:00:00.000Z";

/**
 * The project the draft screen renders with while the real one is not in the catalog. An empty
 * workspace root is the app's existing "no checkout yet" project: every workspace read is skipped.
 * Null when the ids are blank, which the contracts cannot brand.
 */
export function placeholderProject(project: PendingDraftProject): EnvironmentProject | null {
  const environmentId = project.environmentId.trim();
  const id = project.id.trim();
  if (environmentId === "" || id === "") return null;
  return {
    environmentId: EnvironmentId.make(environmentId),
    id: ProjectId.make(id),
    title: project.title.trim() || id,
    workspaceRoot: project.workspaceRoot?.trim() ?? "",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: PLACEHOLDER_TIME,
    updatedAt: PLACEHOLDER_TIME,
  };
}

/** The catalog plus the placeholder, unless the catalog already lists that project. */
export function withPlaceholderProject(
  catalog: ReadonlyArray<EnvironmentProject>,
  placeholder: EnvironmentProject | null,
): ReadonlyArray<EnvironmentProject> {
  if (placeholder === null) return catalog;
  const listed = catalog.some(
    (project) =>
      project.environmentId === placeholder.environmentId && project.id === placeholder.id,
  );
  return listed ? catalog : [...catalog, placeholder];
}

/** The pending draft's reason to block Send, else the stock reason. */
export function pendingDraftSendBlock(
  pending: PendingDraft | null,
  stockReason: string | null,
): string | null {
  return pending?.sendBlockedReason ?? stockReason;
}

/** A draft is listed with user content, as before, or when a distribution holds it pending. */
export function listsDraft(hasUserContent: boolean, pending: PendingDraft | undefined): boolean {
  return hasUserContent || pending !== undefined;
}

/** An empty pending draft has no prompt to title it: its project's title stands in. */
export function draftRowTitle(
  pending: PendingDraft | undefined,
  hasUserContent: boolean,
  stockTitle: string,
): string {
  return hasUserContent || pending === undefined ? stockTitle : pending.project.title;
}

/**
 * The pending draft while the project it is stamped on, or selected, is still its placeholder's.
 * Once the draft is retargeted to a real project the hold no longer applies.
 */
export function pendingDraftHolding(
  pending: PendingDraft | null | undefined,
  project: { readonly environmentId: string; readonly projectId: string } | null | undefined,
): PendingDraft | null {
  if (!pending || !project) return null;
  const held = pending.project;
  return held.environmentId === project.environmentId && held.id === project.projectId
    ? pending
    : null;
}

/**
 * A route draft follows its own stamp: a retarget that restamps the draft without the flow
 * (a distribution swapping in the real project) must move the flow's selection with it.
 */
export function followDraftStamp(
  flow: NewTaskFlowState,
  routeDraftId: string | undefined,
  stamp: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId } | undefined,
): NewTaskFlowState {
  if (routeDraftId === undefined || flow.draftKey !== routeDraftId || stamp === undefined) {
    return flow;
  }
  const projectKey = scopedProjectKey(stamp.environmentId, stamp.projectId);
  if (flow.environmentId === stamp.environmentId && flow.projectKey === projectKey) return flow;
  return { ...flow, environmentId: stamp.environmentId, projectKey };
}
