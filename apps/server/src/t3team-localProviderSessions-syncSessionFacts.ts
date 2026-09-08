/**
 * Per-session facts for the local-provider session sync (split out of
 * `t3team-localProviderSessions-sync.ts`): the resume shape and the instance a
 * thread lands on are per-provider facts, and they belong next to each other.
 * Both read the LOCAL_PROVIDER_KINDS table rather than branching on "codex".
 */

import {
  DEFAULT_MODEL_BY_PROVIDER,
  ProviderDriverKind,
  ProviderInstanceId,
  findLocalProviderKind,
} from "@t3tools/contracts";

import type { LocalProviderSession } from "./t3team-localProviderSessions.ts";

export const resumeCursor = (session: LocalProviderSession) =>
  findLocalProviderKind(session.provider)?.buildResumeCursor(session.nativeId) ?? {
    threadId: session.nativeId,
  };

export const modelFor = (session: LocalProviderSession) => {
  const provider = ProviderDriverKind.make(session.provider);
  return {
    instanceId:
      findLocalProviderKind(session.provider)?.instanceId ??
      ProviderInstanceId.make(session.provider),
    model: session.model ?? DEFAULT_MODEL_BY_PROVIDER[provider]!,
  };
};

export const isSameNativeSession = (
  binding: { readonly provider: string; readonly resumeCursor?: unknown | null },
  session: LocalProviderSession,
) => {
  if (
    binding.provider !== session.provider ||
    !binding.resumeCursor ||
    typeof binding.resumeCursor !== "object"
  )
    return false;
  const cursor = binding.resumeCursor as { threadId?: unknown; resume?: unknown };
  return cursor.threadId === session.nativeId || cursor.resume === session.nativeId;
};
