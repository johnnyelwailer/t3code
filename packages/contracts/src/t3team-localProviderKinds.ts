/**
 * The provider kinds whose *native* desktop sessions this fork can adopt, as one table.
 *
 * Every fact that differs between Codex and Claude here — the instance the resumed thread runs on,
 * the shape of the resume cursor, the label a row shows — used to be an inline
 * `provider === "codex" ? … : …` at six separate call sites across the server and the web app.
 * That reads as "there are exactly two providers, forever": adding a third means finding all six,
 * and getting one wrong silently resumes a session on the wrong instance rather than failing.
 *
 * Lives in contracts because the server writes these sessions and the web app renders them, and
 * they must agree on the mapping; a copy on each side is the same hardcoding with extra steps.
 */
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export interface LocalProviderKindDescriptor {
  readonly kind: ProviderDriverKind;
  /** Provider instance a thread adopted from this kind resumes on. */
  readonly instanceId: ProviderInstanceId;
  /** Human label for icons, tooltips and workspace summaries. */
  readonly displayName: string;
  /**
   * Codex addresses a prior session by thread id alone; Claude additionally needs an explicit
   * `resume` handle. Expressed as a builder so neither side reconstructs the shape by hand.
   */
  readonly buildResumeCursor: (nativeId: string) => Readonly<Record<string, string>>;
  /**
   * How long after its last write a native session is still assumed to be open, and therefore
   * read-only here. Codex rewrites its rollout file on every turn, so a wide window is safe; the
   * Claude reader only sees the transcript and needs a tighter one to avoid locking stale threads.
   */
  readonly activeWindowMs: number;
}

export const LOCAL_PROVIDER_KINDS: ReadonlyArray<LocalProviderKindDescriptor> = [
  {
    kind: ProviderDriverKind.make("codex"),
    instanceId: ProviderInstanceId.make("codex"),
    displayName: "Codex",
    buildResumeCursor: (nativeId) => ({ threadId: nativeId }),
    activeWindowMs: 5 * 60_000,
  },
  {
    kind: ProviderDriverKind.make("claude"),
    // Not "claude": the Claude *driver kind* and the Claude *instance id* differ, which is exactly
    // the kind of mismatch an inline ternary hides.
    instanceId: ProviderInstanceId.make("claudeAgent"),
    displayName: "Claude",
    buildResumeCursor: (nativeId) => ({ resume: nativeId, threadId: nativeId }),
    activeWindowMs: 90_000,
  },
];

const byKind = new Map(LOCAL_PROVIDER_KINDS.map((entry) => [entry.kind as string, entry]));

/** `undefined` for a kind this fork cannot adopt sessions from — callers must handle that. */
export function findLocalProviderKind(kind: string): LocalProviderKindDescriptor | undefined {
  return byKind.get(kind);
}

const byInstanceId = new Map(
  LOCAL_PROVIDER_KINDS.map((entry) => [entry.instanceId as string, entry]),
);

/**
 * The web app identifies an adopted session by the instance it resumes on (the id embedded in
 * `local:<instanceId>:…` message ids), while the server identifies it by driver kind. Both index
 * the same table rather than each keeping its own idea of the pairing.
 */
export function findLocalProviderKindByInstanceId(
  instanceId: string,
): LocalProviderKindDescriptor | undefined {
  return byInstanceId.get(instanceId);
}

/** Label for any kind, falling back to the raw kind so an unknown provider is still legible. */
export function localProviderDisplayName(kind: string): string {
  return (byKind.get(kind) ?? byInstanceId.get(kind))?.displayName ?? kind;
}
