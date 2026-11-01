/**
 * Writes a pending binding once its thread exists; clears it only when the server settled it.
 * Refusals are cleared and reported once (a retry gets the same answer); an unknown thread or an
 * unavailable server is retried a few times, then left for the next mount until `PENDING_TTL_MS`.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { toastManager } from "~/components/ui/toast";
import { waitForThreadShell } from "~/state/entities";

import type { BindingWriteOutcome } from "./t3team-contextChatBindingOutcome";
import { recordContextBindingRemote } from "./t3team-contextChatBindingRpc";
import {
  type PendingContextBinding,
  pendingBindingKey,
  useContextChatPendingStore,
} from "./t3team-contextChatPendingStore";

export const SHELL_WAIT_MS = 30_000;
export const SHELL_WAIT_ROUNDS = 4;
export const MAX_WRITE_ATTEMPTS = 5;
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const backoffMs = (attempt: number) => 1_000 * 2 ** (attempt - 1);

export type SettleResult = "bound" | "refused" | "expired" | "deferred";

export interface BindingWriterDeps {
  readonly record: (entry: PendingContextBinding) => Promise<BindingWriteOutcome>;
  readonly waitForShell: (entry: PendingContextBinding) => Promise<boolean>;
  readonly clear: (entry: PendingContextBinding) => void;
  readonly onRefused: (entry: PendingContextBinding, message: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export async function settlePendingBinding(
  entry: PendingContextBinding,
  deps: BindingWriterDeps,
): Promise<SettleResult> {
  const giveUpOrDefer = (): SettleResult => {
    if (deps.now() - entry.queuedAt <= PENDING_TTL_MS) return "deferred";
    deps.clear(entry);
    return "expired";
  };
  // The write is queued before attachments upload, so the thread can take a while to appear.
  let shellKnown = false;
  for (let round = 0; round < SHELL_WAIT_ROUNDS && !shellKnown; round += 1) {
    shellKnown = await deps.waitForShell(entry);
  }
  if (!shellKnown) return giveUpOrDefer();
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const outcome = await deps.record(entry);
    if (outcome.kind === "bound") {
      deps.clear(entry);
      return "bound";
    }
    if (outcome.kind === "refused") {
      deps.onRefused(entry, outcome.message);
      deps.clear(entry);
      return "refused";
    }
    if (attempt < MAX_WRITE_ATTEMPTS) await deps.sleep(backoffMs(attempt));
  }
  return giveUpOrDefer();
}

const liveDeps: BindingWriterDeps = {
  record: recordContextBindingRemote,
  waitForShell: (entry) =>
    waitForThreadShell(scopeThreadRef(entry.environmentId, entry.threadId), SHELL_WAIT_MS),
  clear: (entry) =>
    useContextChatPendingStore.getState().clearPending(entry.environmentId, entry.threadId),
  onRefused: (_entry, message) =>
    toastManager.add({
      type: "warning",
      title: "This chat could not be tied to its view",
      description: message,
    }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const inFlight = new Set<string>();

/** Starts settling one entry unless it already is. Not tied to a component, so a send outlives it. */
export function kickPendingBinding(
  entry: PendingContextBinding,
  deps: BindingWriterDeps = liveDeps,
): Promise<SettleResult | "in-flight"> {
  const key = pendingBindingKey(entry.environmentId, entry.threadId);
  if (inFlight.has(key)) return Promise.resolve("in-flight");
  inFlight.add(key);
  return settlePendingBinding(entry, deps).finally(() => inFlight.delete(key));
}

/** Retries every entry the last session left behind (the pane calls it on mount). */
export function kickAllPendingBindings(deps: BindingWriterDeps = liveDeps) {
  for (const entry of Object.values(useContextChatPendingStore.getState().pending)) {
    void kickPendingBinding(entry, deps);
  }
}
