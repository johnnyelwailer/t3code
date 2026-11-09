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

/**
 * Moves the old key's draft to the new key. The old key is cleared in the same step that copies
 * it, so text typed during the write stays there; true only if nothing is left on the old key.
 */
async function moveThreadComposerDraft(fromKey: string, toKey: string): Promise<boolean> {
  const draft = getComposerDraftSnapshot(fromKey);
  if (isComposerDraftEmpty(draft)) return true;
  const content = {
    text: draft.text,
    ...(draft.context ? { context: draft.context } : {}),
    attachments: draft.attachments,
  };
  const settings = {
    ...(draft.modelSelection ? { modelSelection: draft.modelSelection } : {}),
    ...(draft.runtimeMode ? { runtimeMode: draft.runtimeMode } : {}),
    ...(draft.interactionMode ? { interactionMode: draft.interactionMode } : {}),
  };
  // The files stay: the new key's draft owns them once the merge lands.
  clearComposerDraft(fromKey, { deferAttachmentCleanup: true });
  try {
    await mergeComposerDraftContent(toKey, content);
    updateComposerDraftSettings(toKey, settings);
  } catch (error) {
    // Put the text back where it was rather than lose it.
    await mergeComposerDraftContent(fromKey, content);
    updateComposerDraftSettings(fromKey, settings);
    throw error;
  }
  return isComposerDraftEmpty(getComposerDraftSnapshot(fromKey));
}

/**
 * New threads moved from a placeholder environment to the real one: every open route showing one
 * follows to the real environment first, then their unsent composer text moves. Never throws;
 * true only if every composer draft moved.
 */
export async function followRetargetedThreads(
  from: EnvironmentId,
  to: EnvironmentId,
  threadIds: ReadonlyArray<ThreadId>,
): Promise<boolean> {
  if (threadIds.length === 0) return true;
  // Before any await: a composer still on the old route would queue onto the placeholder.
  whenRootNavigationReady(() => {
    const routes = (rootNavigationRef.getRootState()?.routes ?? []) as ReadonlyArray<RouteNode>;
    for (const key of threadRouteKeys(routes, from, new Set<string>(threadIds))) {
      rootNavigationRef.dispatch({
        ...CommonActions.setParams({ environmentId: to }),
        source: key,
      });
    }
  });
  let moved = true;
  for (const threadId of threadIds) {
    try {
      const fromKey = scopedThreadKey(from, threadId);
      moved = (await moveThreadComposerDraft(fromKey, scopedThreadKey(to, threadId))) && moved;
    } catch (error) {
      console.warn("[thread-outbox] could not move a moved thread's composer draft", error);
      moved = false;
    }
  }
  return moved;
}
