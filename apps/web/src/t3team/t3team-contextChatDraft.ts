/**
 * The one open draft of a context chat binding, created through the composer draft store with no
 * route. The binding key is the draft store's logical project key, so asking again returns the
 * draft that is already open instead of a second one.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ThreadId } from "@t3tools/contracts";

import {
  type DraftId,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "~/composerDraftStore";
import { newDraftId, newThreadId } from "~/lib/utils";
import { readThreadShell } from "~/state/entities";

export interface ContextChatDraft {
  readonly draftId: DraftId;
  readonly threadId: ThreadId;
}

export function ensureContextChatDraft(input: {
  readonly projectRef: ScopedProjectRef;
  readonly bindingKey: string;
}): ContextChatDraft {
  const store = useComposerDraftStore.getState();
  const existing = store.getDraftSessionByLogicalProjectKey(input.bindingKey);
  if (existing !== null) {
    const ref = scopeThreadRef(existing.environmentId, existing.threadId);
    if (existing.promotedTo == null && readThreadShell(ref) === null) {
      return { draftId: existing.draftId, threadId: existing.threadId };
    }
    // Its thread reached the server: that is a sent chat, not an open draft.
    markPromotedDraftThreadByRef(ref);
  }
  const draftId = newDraftId();
  const threadId = newThreadId();
  store.setLogicalProjectDraftThreadId(input.bindingKey, input.projectRef, draftId, {
    threadId,
    createdAt: new Date().toISOString(),
    branch: null,
    worktreePath: null,
    envMode: "local",
    startFromOrigin: false,
  });
  store.applyStickyState(draftId);
  return { draftId, threadId };
}
