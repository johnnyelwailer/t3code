/** What a `t3team.contextBinding.record` attempt means for a retry, and how a failure is sorted. */
export type BindingWriteOutcome =
  | { readonly kind: "bound" }
  /** The server does not know the thread yet (the shell reached this client first). Retry. */
  | { readonly kind: "thread-not-found" }
  /** A conflict, an unsupported stored value, another project, or the flag off. Never retry. */
  | { readonly kind: "refused"; readonly message: string }
  /** No connection, no permission, interrupted. The thread may be fine; retry later. */
  | { readonly kind: "unavailable"; readonly message: string };

/** The server's refusal for a thread it cannot resolve (`apps/server/src/t3team-contextBinding.ts`). */
export const THREAD_NOT_FOUND_MESSAGE = "The thread was not found.";

export function classifyBindingFailure(error: unknown): BindingWriteOutcome {
  const tagged = error as { readonly _tag?: unknown; readonly message?: unknown } | null;
  const message = typeof tagged?.message === "string" ? tagged.message : "Unknown error.";
  if (tagged?._tag !== "T3TeamContextBindingError") return { kind: "unavailable", message };
  return message === THREAD_NOT_FOUND_MESSAGE
    ? { kind: "thread-not-found" }
    : { kind: "refused", message };
}
