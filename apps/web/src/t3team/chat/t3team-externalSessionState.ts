import type { Thread } from "~/types";

export type ExternalSession = {
  readonly provider: "codex" | "claudeAgent";
  readonly updatedAt: string;
};

export const EXTERNAL_SESSION_ACTIVE_WINDOW_MS = 90_000;

export function readExternalSession(thread: Thread | null): ExternalSession | null {
  if (!thread) return null;
  const provider = thread.messages.some((message) => message.id.startsWith("local:codex:"))
    ? "codex"
    : thread.messages.some((message) => message.id.startsWith("local:claudeAgent:"))
      ? "claudeAgent"
      : null;
  if (!provider) return null;
  const latest = thread.messages.at(-1)?.createdAt ?? thread.updatedAt ?? thread.createdAt;
  return { provider, updatedAt: latest };
}

export function isExternalSessionActive(session: ExternalSession, now = Date.now()): boolean {
  const updatedAt = Date.parse(session.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt >= 0 && now - updatedAt < EXTERNAL_SESSION_ACTIVE_WINDOW_MS;
}

export function externalProviderName(provider: ExternalSession["provider"]): string {
  return provider === "codex" ? "Codex" : "Claude";
}
