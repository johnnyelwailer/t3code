import { useEffect, useRef } from "react";

import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

type QueuedTurnStartHooks = {
  readonly beforeDispatchTurnStart?:
    | ChatViewT3TeamExtensionProps["beforeDispatchTurnStart"]
    | undefined;
  readonly dispatchTurnStartOverride?:
    | ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]
    | undefined;
};

type QueuedTurnStart = Parameters<
  NonNullable<ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]>
>[0];

type HooksRef = { readonly current: QueuedTurnStartHooks };

const hooksByThreadKey = new Map<string, HooksRef>();

/** Registers hooks for a thread; returns the unregister call. A later registration wins. */
export function registerQueuedTurnStartHooks(threadKey: string, entry: HooksRef): () => void {
  hooksByThreadKey.set(threadKey, entry);
  return () => {
    if (hooksByThreadKey.get(threadKey) === entry) hooksByThreadKey.delete(threadKey);
  };
}

/**
 * Registers the mounted chat view's turn-start hooks for its thread, so a queued message sent by
 * the root `QueuedMessageSender` takes the same fork path as a composer send: tool-context sync,
 * then recipe-input / staged-action / kickoff routing. Threads that are not on screen have no
 * hooks and fall back to the plain turn start.
 */
export function useRegisterQueuedTurnStartHooks(
  threadKey: string | null,
  hooks: QueuedTurnStartHooks,
): void {
  const hooksRef = useRef(hooks);
  useEffect(() => {
    hooksRef.current = hooks;
  });
  useEffect(() => {
    if (threadKey === null) return;
    return registerQueuedTurnStartHooks(threadKey, hooksRef);
  }, [threadKey]);
}

/**
 * Runs the registered hooks for a queued send. Resolves true when a hook handled the turn (a
 * resolved recipe input, a staged action, a kickoff launch) and the plain turn start must be
 * skipped. A failed tool-context sync is logged and does not block the send, as in the composer.
 */
export async function runQueuedTurnStartHooks(
  threadKey: string,
  turnStart: QueuedTurnStart,
): Promise<boolean> {
  const hooks = hooksByThreadKey.get(threadKey)?.current;
  if (!hooks) return false;
  if (hooks.beforeDispatchTurnStart) {
    try {
      await hooks.beforeDispatchTurnStart();
    } catch (error) {
      console.error("[chat] thread tool-context sync failed; starting the turn anyway", error);
    }
  }
  if (!hooks.dispatchTurnStartOverride) return false;
  return Boolean(await hooks.dispatchTurnStartOverride(turnStart));
}
