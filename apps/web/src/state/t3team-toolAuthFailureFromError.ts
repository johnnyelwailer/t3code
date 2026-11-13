/**
 * Classifies what came back from a tool-auth RPC, so the card renders the same plain-words copy
 * whether the machine answered with a `failed` state or the call blew up.
 *
 * @module state/toolAuthFailureFromError
 */
import type { ToolAuthState } from "@t3tools/contracts";

import type { ToolAuthFailureKind } from "./t3team-toolAuthFailureMessage";

const REASON_BY_ERROR_TAG: Readonly<Record<string, ToolAuthFailureKind>> = {
  ToolAuthSpawnError: "spawnFailed",
  ToolAuthNoActiveSessionError: "noActiveSession",
  ToolAuthNotAwaitingCodeError: "notAwaitingCode",
  RpcTransportError: "offline",
  ConnectionLost: "offline",
};

function errorTag(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const tag = (error as { readonly _tag?: unknown })._tag;
  return typeof tag === "string" ? tag : undefined;
}

/** The squashed failure of an atom command, as a reason the copy table knows. */
export function toolAuthFailureReasonFromError(error: unknown): ToolAuthFailureKind {
  return REASON_BY_ERROR_TAG[errorTag(error) ?? ""] ?? "requestFailed";
}

/**
 * A `failed`/`expired` state the RPC *returned* — the feature-gate refusal arrives this way, as a
 * success value, which is exactly what used to make Install and connect look like a no-op.
 */
export function toolAuthFailureReasonFromState(
  state: Pick<ToolAuthState, "phase" | "reason"> | undefined,
): ToolAuthFailureKind | null {
  if (state === undefined) return null;
  if (state.phase === "expired") return state.reason ?? "credentialExpired";
  if (state.phase !== "failed") return null;
  return state.reason ?? "requestFailed";
}
