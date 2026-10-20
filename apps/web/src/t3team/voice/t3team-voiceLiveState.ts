/**
 * The compact per-utterance snapshot of the user's threads, attached to every voice message as
 * one inline context entry (`message.context`). Built fresh each utterance, so the agent never
 * needs the voice thread's own history for state.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { ComposerContextId, type ComposerContextRecord, type ThreadId } from "@t3tools/contracts";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";

export const VOICE_STATE_KIND = "voice-state";
const VOICE_STATE_CONTEXT_ID = ComposerContextId.make("voice-live-state");
const MAX_LISTED_THREADS = 20;
const MAX_TITLE_CHARS = 80;

export type VoiceThreadShell = Pick<
  EnvironmentThreadShell,
  | "id"
  | "title"
  | "updatedAt"
  | "archivedAt"
  | "deletedAt"
  | "settledAt"
  | "hasPendingUserInput"
  | "hasPendingApprovals"
  | "latestRun"
>;

type LiveThread = { readonly id: string; readonly title: string; readonly status: string };

const clip = (title: string) =>
  title.length <= MAX_TITLE_CHARS ? title : `${title.slice(0, MAX_TITLE_CHARS - 1)}…`;

const statusOf = (thread: VoiceThreadShell): string =>
  thread.hasPendingUserInput || thread.hasPendingApprovals
    ? "waiting-for-user"
    : (thread.latestRun?.status ?? "idle");

/** Most recently active live threads, newest first, excluding the voice thread itself. */
export function voiceLiveThreads(
  threads: ReadonlyArray<VoiceThreadShell>,
  voiceThreadId: ThreadId,
): { readonly total: number; readonly listed: ReadonlyArray<LiveThread> } {
  const live = threads
    .filter(
      (thread) =>
        thread.id !== voiceThreadId &&
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        thread.settledAt === null,
    )
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    total: live.length,
    listed: live
      .slice(0, MAX_LISTED_THREADS)
      .map((thread) => ({ id: thread.id, title: clip(thread.title), status: statusOf(thread) })),
  };
}

/** The message text with its live-state chip, plus the record the chip points at. */
export function withVoiceLiveState(
  utterance: string,
  state: ReturnType<typeof voiceLiveThreads>,
): { readonly text: string; readonly records: ReadonlyArray<ComposerContextRecord> } {
  const chip = formatComposerContextReference({
    kind: VOICE_STATE_KIND,
    contextId: VOICE_STATE_CONTEXT_ID,
    label: "live state",
  });
  return {
    text: `${utterance}\n\n${chip}`,
    records: [
      {
        version: 1,
        contextId: VOICE_STATE_CONTEXT_ID,
        label: "live state",
        kind: VOICE_STATE_KIND,
        payload: { activeThreads: state.total, threads: state.listed },
      },
    ],
  };
}
