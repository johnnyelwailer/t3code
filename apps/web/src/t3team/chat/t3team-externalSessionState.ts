import { findLocalProviderKindByInstanceId, localProviderDisplayName } from "@t3tools/contracts";

import type { Thread } from "~/types";

export type ExternalSession = {
  readonly provider: "codex" | "claudeAgent";
  readonly nativeId: string;
  readonly updatedAt: string;
};

// Sourced from the shared LOCAL_PROVIDER_KINDS table so the server and this app cannot drift on
// how long a native session counts as open.
export const CODEX_EXTERNAL_SESSION_ACTIVE_WINDOW_MS =
  findLocalProviderKindByInstanceId("codex")!.activeWindowMs;
export const CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS =
  findLocalProviderKindByInstanceId("claudeAgent")!.activeWindowMs;
// Legacy project-sidebar rows have no native session id for the Claude check.
export const EXTERNAL_SESSION_ACTIVE_WINDOW_MS = CODEX_EXTERNAL_SESSION_ACTIVE_WINDOW_MS;

export function readExternalSession(thread: Thread | null): ExternalSession | null {
  if (!thread) return null;
  const firstExternalMessage = thread.messages.find((message) => message.id.startsWith("local:"));
  const match = firstExternalMessage?.id.match(/^local:(codex|claudeAgent):([^:]+):/u);
  if (!match) return null;
  const provider = match[1] as ExternalSession["provider"];
  const timestamps = [thread.updatedAt, thread.createdAt];
  for (const message of thread.messages) {
    if (message.id.startsWith("local:")) timestamps.push(message.createdAt);
  }
  const latest = timestamps
    .filter(
      (value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)),
    )
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!latest) return null;
  return { provider, nativeId: match[2]!, updatedAt: latest };
}

export function isExternalSessionActive(session: ExternalSession, now = Date.now()): boolean {
  const updatedAt = Date.parse(session.updatedAt);
  const windowMs =
    findLocalProviderKindByInstanceId(session.provider)?.activeWindowMs ??
    CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS;
  return Number.isFinite(updatedAt) && now - updatedAt >= 0 && now - updatedAt < windowMs;
}

export function externalProviderName(provider: ExternalSession["provider"]): string {
  return localProviderDisplayName(provider);
}

/**
 * A sidebar thread adopted from a local provider session (official Codex or Claude app).
 * `providerKind` is only ever derived by t3team-threadBridge from the `local:` message ids
 * that the local-provider sync writes, so its presence is the display-side equivalent of
 * `readExternalSession` for the lightweight ProjectThread rows the sidebar lists.
 * The `| undefined` is load-bearing under exactOptionalPropertyTypes: TS normalizes arrays
 * of heterogeneous rows into unions where some members carry a required `providerKind: undefined`.
 */
export function isLocalProviderSessionThread(
  thread: { readonly providerKind?: string | undefined } | null | undefined,
): boolean {
  return Boolean(thread?.providerKind);
}

/**
 * Hide already-adopted local provider sessions from a thread list when the
 * "Local provider sessions" setting is off. This is HIDE, not delete: the
 * store keeps every row, and the filter re-applies on each toggle transition
 * (either direction), so turning the setting back on restores the rows without
 * re-syncing.
 */
export function filterLocalProviderSessionThreads<
  T extends { readonly providerKind?: string | undefined },
>(threads: ReadonlyArray<T>, show: boolean): T[] {
  return show ? [...threads] : threads.filter((thread) => !isLocalProviderSessionThread(thread));
}
