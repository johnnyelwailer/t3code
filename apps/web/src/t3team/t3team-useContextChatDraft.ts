/**
 * State of a context chat tab: a draft until its first send, then the server thread, with no
 * route. The open thread is remembered per binding, so the tab shows it again after the host
 * unmounts or the app reloads; "New chat" forgets it and opens a fresh draft under the same binding.
 */
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, T3TeamContextBinding, ThreadId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { threadShellHasStarted } from "~/components/ChatView.logic";
import { waitForDraftHeroTransition } from "~/components/chat/draftHeroTransition";
import { markPromotedDraftThreadByRef, useComposerDraftStore } from "~/composerDraftStore";
import { useThreadShell } from "~/state/entities";
import { useEnvironmentShellHasSnapshot } from "~/state/shell";

import { contextChatBindingKey } from "./t3team-contextChatBinding";
import { type ContextChatDraft, ensureContextChatDraft } from "./t3team-contextChatDraft";
import { kickAllPendingBindings, kickPendingBinding } from "./t3team-contextChatBindingWriter";
import { useContextChatPendingStore } from "./t3team-contextChatPendingStore";

export type ContextChatView =
  | { readonly kind: "draft"; readonly draft: ContextChatDraft }
  | { readonly kind: "thread"; readonly threadId: ThreadId };

/** The open thread if the binding has one, else its one draft (opened now if it is not yet). */
function resolveContextChatView(
  environmentId: EnvironmentId,
  binding: T3TeamContextBinding,
): ContextChatView {
  const bindingKey = contextChatBindingKey(environmentId, binding);
  const active = useContextChatPendingStore.getState().activeByBindingKey[bindingKey];
  if (active?.environmentId === environmentId) {
    return { kind: "thread", threadId: active.threadId };
  }
  const projectRef = scopeProjectRef(environmentId, binding.projectId);
  return { kind: "draft", draft: ensureContextChatDraft({ projectRef, bindingKey }) };
}

export function useContextChatDraft(input: {
  readonly environmentId: EnvironmentId;
  readonly binding: T3TeamContextBinding;
}) {
  const { environmentId, binding } = input;
  const bindingKey = contextChatBindingKey(environmentId, binding);
  const [view, setView] = useState<ContextChatView>(() =>
    resolveContextChatView(environmentId, binding),
  );
  const threadId = view.kind === "draft" ? view.draft.threadId : view.threadId;
  const shell = useThreadShell(scopeThreadRef(environmentId, threadId));
  const snapshotLoaded = useEnvironmentShellHasSnapshot(environmentId);
  const draftExists = useComposerDraftStore((store) =>
    view.kind === "draft" ? store.getDraftSession(view.draft.draftId) !== null : false,
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- retries the previous session's unacknowledged bindings once
  useEffect(() => kickAllPendingBindings(), []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- swaps draft for thread when the server owns the send, as AppDraftPane does
  useEffect(() => {
    if (view.kind !== "draft" || shell === null) return;
    markPromotedDraftThreadByRef(scopeThreadRef(environmentId, view.draft.threadId));
    if (!threadShellHasStarted(shell)) return;
    let cancelled = false;
    void waitForDraftHeroTransition().then(() => {
      if (cancelled) return;
      useContextChatPendingStore.getState().setActive(bindingKey, {
        environmentId,
        threadId: view.draft.threadId,
      });
      setView({ kind: "thread", threadId: view.draft.threadId });
    });
    return () => {
      cancelled = true;
    };
  }, [bindingKey, environmentId, shell, view]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a draft discarded unsent, or a thread deleted since, makes room for a fresh draft
  useEffect(() => {
    const gone =
      view.kind === "draft" ? !draftExists && shell === null : shell === null && snapshotLoaded;
    if (!gone) return;
    if (view.kind === "thread") useContextChatPendingStore.getState().clearActive(bindingKey);
    // oxlint-disable-next-line react/set-state-in-effect -- the stores this reads changed outside React
    setView(resolveContextChatView(environmentId, binding));
  }, [binding, bindingKey, draftExists, environmentId, shell, snapshotLoaded, view]);

  /** Persisted before the first send is dispatched; the thread does not exist until then. */
  const beforeDispatchTurnStart = () => {
    if (view.kind !== "draft") return;
    const entry = { environmentId, threadId: view.draft.threadId, binding, queuedAt: Date.now() };
    useContextChatPendingStore.getState().addPending(entry);
    void kickPendingBinding(entry);
  };

  const newChat = () => {
    useContextChatPendingStore.getState().clearActive(bindingKey);
    setView(resolveContextChatView(environmentId, binding));
  };

  return { view, snapshotLoaded, shell, beforeDispatchTurnStart, newChat };
}
