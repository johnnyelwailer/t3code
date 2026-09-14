/**
 * React-side drain for the t3team outbox. Mounted once per open thread view;
 * the global dispatch lock in the store keeps concurrent views from
 * double-sending the same entry.
 *
 * The drain runs only while this environment's connection phase is
 * "connected" and dispatches the queue head FIFO. Before (re)sending a
 * turn-start or workflow answer it consults the head thread's message list —
 * which it also subscribes to, so the read model loads — and discards the
 * entry when the server already accepted the send with the same message id.
 */
import { useEffect, useRef } from "react";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { threadEnvironment } from "~/state/threads";
import { useEnvironment } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { useThreadDetail } from "~/state/entities";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchStagedComposerActionOnThread } from "~/t3team/chat/t3team-threadStagedActionLaunch";
import { dispatchT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxDispatch";
import type { T3TeamOutboxStagedActionPayload } from "~/t3team/outbox/t3team-outboxModel";
import {
  acquireOutboxDispatch,
  clearOutboxAttempt,
  getOutboxAttemptTs,
  releaseOutboxDispatch,
  setOutboxAttempt,
  storedOutboxEntryExists,
} from "~/t3team/outbox/t3team-outboxStorage";
import {
  acquireT3TeamOutboxDispatch,
  getT3TeamOutboxEntriesForEnvironment,
  recordT3TeamOutboxFailure,
  recordT3TeamOutboxRetry,
  removeT3TeamOutboxEntry,
  releaseT3TeamOutboxDispatch,
  useT3TeamOutboxStore,
} from "~/t3team/outbox/t3team-outboxStore";

type HeadThreadMessages = ReadonlyArray<{ readonly id: string; readonly role: string }> | null;

export function useT3TeamOutboxDrain(input: {
  readonly environmentId: EnvironmentId;
  readonly backend: BackendApi | null | undefined;
}): void {
  const environment = useEnvironment(input.environmentId);
  const phase = environment?.connection.phase ?? "available";
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const snapshot = useT3TeamOutboxStore();

  const headEntry = getT3TeamOutboxEntriesForEnvironment(input.environmentId)[0] ?? null;
  // Subscribe to the head thread's read model so the idempotency check can
  // answer instead of deferring forever.
  const headThreadRef = headEntry
    ? scopeThreadRef(input.environmentId, headEntry.threadId as ThreadId)
    : null;
  const headThread = useThreadDetail(headThreadRef);

  const depsRef = useRef<{
    backend: BackendApi | null | undefined;
    startTurn: typeof startTurn;
    headMessages: HeadThreadMessages;
  }>({ backend: input.backend, startTurn, headMessages: null });
  depsRef.current = {
    backend: input.backend,
    startTurn,
    headMessages: headThread?.messages ?? null,
  };

  useEffect(() => {
    if (phase !== "connected") return;
    const entry = headEntry;
    if (!entry || snapshot.dispatchingEntryId !== null) return;
    // A permanent failure parks the entry until the user hits Resend; without
    // this the drain would re-dispatch it in a tight loop.
    if (snapshot.failures[entry.entryId] !== undefined) return;
    if ((snapshot.retryNotBefore[entry.entryId] ?? 0) > Date.now()) return;
    // Another tab may already have delivered or discarded this entry; the
    // durable record is the source of truth, so drop a stale in-memory copy.
    if (!storedOutboxEntryExists(entry.entryId)) {
      removeT3TeamOutboxEntry(entry);
      return;
    }
    if (!acquireT3TeamOutboxDispatch(entry.entryId)) return;
    // Cross-tab guard: a fresh claim owned by another tab means it is already
    // dispatching this entry, so this tab stays out.
    if (!acquireOutboxDispatch(entry.entryId)) {
      releaseT3TeamOutboxDispatch();
      return;
    }
    const { backend, startTurn: startTurnFn, headMessages } = depsRef.current;
    void dispatchT3TeamOutboxEntry(entry, {
      startTurn: (request) => startTurnFn(request),
      resolveWorkflowInput: (request) =>
        backend ? backend.resolveWorkflowInput(request) : Promise.reject(new Error("No backend.")),
      submitRecipeCardAction: (request) =>
        backend
          ? backend.submitRecipeCardAction(request)
          : Promise.reject(new Error("No backend.")),
      launchStagedAction: (payload: T3TeamOutboxStagedActionPayload) => {
        if (!backend) return Promise.reject(new Error("No backend."));
        if (payload.modelSelection === null) {
          return Promise.reject(new Error("No model selection was recorded for this action."));
        }
        return launchStagedComposerActionOnThread({
          backend,
          threadId: entry.threadId,
          action: payload.action,
          composerText: payload.composerText,
          modelSelection: payload.modelSelection,
          runtimeMode: payload.runtimeMode,
          interactionMode: payload.interactionMode,
        });
      },
      threadHasUserMessage: (_environmentId, threadId, messageId) => {
        // Only the head thread's read model is subscribed; every dispatch is
        // for the head entry, so any other thread id is "unknown".
        if (threadId !== entry.threadId || headMessages === null) return null;
        return headMessages.some((message) => message.id === messageId && message.role === "user");
      },
      outboxAttemptTs: (entryId) => getOutboxAttemptTs(entryId),
      recordOutboxAttempt: (entryId) => setOutboxAttempt(entryId),
    })
      .then((outcome) => {
        if (outcome.outcome === "delivered") {
          removeT3TeamOutboxEntry(entry);
        } else if (outcome.outcome === "retry") {
          recordT3TeamOutboxRetry(entry.entryId);
        } else {
          // A permanent server rejection means the turn was not accepted, so it
          // is safe to allow a resend — drop the at-most-once shield.
          if (entry.kind === "turn-start") clearOutboxAttempt(entry.entryId);
          recordT3TeamOutboxFailure(entry.entryId, outcome.error);
        }
      })
      .finally(() => {
        releaseOutboxDispatch(entry.entryId);
        releaseT3TeamOutboxDispatch();
      });
  }, [
    phase,
    headEntry?.entryId,
    snapshot.dispatchingEntryId,
    snapshot.tick,
    snapshot.retryNotBefore,
    snapshot.failures,
    headThread,
  ]);
}
