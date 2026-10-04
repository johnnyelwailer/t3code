/**
 * Dependency-free hand-off between the composer draft store and the composing heartbeat.
 *
 * `composerDraftStore` sits underneath the connection runtime (`connection/platform.ts` imports it),
 * so it must not import the heartbeat module, which needs that runtime: the cycle left
 * `connectionAtomRuntime` undefined at module evaluation for every file that loaded the store
 * first. The store notifies this sink; the heartbeat registers itself as the reporter.
 */

type ThreadComposingReporter = (threadId: string | null | undefined) => void;

let reporter: ThreadComposingReporter | null = null;

export function setThreadComposingReporter(next: ThreadComposingReporter | null): void {
  reporter = next;
}

/** Fire-and-forget; a no-op until the heartbeat module has registered. */
export function notifyThreadComposing(threadId: string | null | undefined): void {
  reporter?.(threadId);
}
