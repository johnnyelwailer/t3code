import { CommonActions } from "@react-navigation/native";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { rootNavigationRef, whenRootNavigationReady } from "../lib/rootNavigation";
import { scopedThreadKey } from "../lib/scopedEntities";
import {
  clearComposerDraft,
  getComposerDraftSnapshot,
  isComposerDraftEmpty,
  mergeComposerDraftContent,
  updateComposerDraftSettings,
} from "./use-composer-drafts";

interface RouteNode {
  readonly key: string;
  readonly name: string;
  readonly params?: object;
  readonly state?: { readonly routes: ReadonlyArray<RouteNode> };
}

/** Keys of the routes, at any depth, that show one of `threadIds` on `environmentId`. */
function threadRouteKeys(
  routes: ReadonlyArray<RouteNode>,
  environmentId: EnvironmentId,
  threadIds: ReadonlySet<string>,
): string[] {
  return routes.flatMap((route) => {
    const params = route.params as { environmentId?: unknown; threadId?: unknown } | undefined;
    const shows =
      route.name === "Thread" &&
      params?.environmentId === environmentId &&
      typeof params.threadId === "string" &&
      threadIds.has(params.threadId);
    return [
      ...(shows ? [route.key] : []),
      ...threadRouteKeys(route.state?.routes ?? [], environmentId, threadIds),
    ];
  });
}

async function moveThreadComposerDraft(fromKey: string, toKey: string): Promise<void> {
  const draft = getComposerDraftSnapshot(fromKey);
  if (isComposerDraftEmpty(draft)) return;
  await mergeComposerDraftContent(toKey, {
    text: draft.text,
    ...(draft.context ? { context: draft.context } : {}),
    attachments: draft.attachments,
  });
  updateComposerDraftSettings(toKey, {
    ...(draft.modelSelection ? { modelSelection: draft.modelSelection } : {}),
    ...(draft.runtimeMode ? { runtimeMode: draft.runtimeMode } : {}),
    ...(draft.interactionMode ? { interactionMode: draft.interactionMode } : {}),
  });
  // The real thread's draft owns the files now.
  clearComposerDraft(fromKey, { deferAttachmentCleanup: true });
}

/**
 * New threads moved from a placeholder environment to the real one: their unsent composer text
 * moves with them, and every open route showing one follows to the real environment.
 */
export async function followRetargetedThreads(
  from: EnvironmentId,
  to: EnvironmentId,
  threadIds: ReadonlyArray<ThreadId>,
): Promise<void> {
  if (threadIds.length === 0) return;
  for (const threadId of threadIds) {
    await moveThreadComposerDraft(scopedThreadKey(from, threadId), scopedThreadKey(to, threadId));
  }
  whenRootNavigationReady(() => {
    const routes = (rootNavigationRef.getRootState()?.routes ?? []) as ReadonlyArray<RouteNode>;
    for (const key of threadRouteKeys(routes, from, new Set<string>(threadIds))) {
      rootNavigationRef.dispatch({
        ...CommonActions.setParams({ environmentId: to }),
        source: key,
      });
    }
  });
}
