/**
 * One voice utterance from transcript to the voice thread: route it to a tier, make sure the
 * thread exists (created on first use with the role prompt as its first message, always under
 * "No project", never in whichever project happens to be open or listed first), then send it
 * with the tier's model and the fresh live state. While a
 * voice turn is running, utterances queue behind it (existing queue semantics, no interrupt).
 */
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type {
  ChatAttachment,
  MessageId,
  ModelSelection,
  ProjectId,
  ThreadId,
  VoiceTranscriptMetadata,
} from "@t3tools/contracts";

import { VOICE_ROLE_PROMPT, VOICE_THREAD_TITLE } from "./t3team-voiceRolePrompt";
import {
  voiceLiveThreads,
  withVoiceLiveState,
  type VoiceThreadShell,
} from "./t3team-voiceLiveState";
import { VOICE_TIER_MODEL, type VoiceTier } from "./t3team-voiceRouting";
import { voiceTranscriptMetaFile } from "./t3team-voiceTranscriptMeta";
import type { VoiceThreadHome } from "./t3team-voiceThreadStore";

export type VoiceSubmitResult =
  | { readonly status: "sent"; readonly tier: VoiceTier }
  | {
      readonly status: "error";
      readonly code: "no-project" | "send-failed";
      readonly detail: string;
    };

export interface VoiceSessionDeps {
  readonly threads: () => ReadonlyArray<VoiceThreadShell>;
  readonly home: () => VoiceThreadHome | undefined;
  readonly remember: (home: VoiceThreadHome) => void;
  readonly forget: () => void;
  /**
   * The environment's "No project" (scratch) project, created on first use, or null when the
   * machine offers none. Voice threads only ever live here.
   */
  readonly projectlessProject: () => Promise<ProjectId | null>;
  readonly route: (text: string) => Promise<ModelSelection>;
  readonly startTurn: (input: StartThreadTurnInput) => Promise<void>;
  /** Uploads a generated file for the next message; null when it could not be uploaded. */
  readonly uploadFile?: (file: File) => Promise<ChatAttachment | null>;
  readonly pinAndKeep: (threadId: ThreadId) => Promise<void>;
  /** Undoes `pinAndKeep` for a voice thread that was replaced: it goes back to being a normal thread. */
  readonly release: (threadId: ThreadId) => Promise<void>;
  readonly waitForThread: (threadId: ThreadId) => Promise<void>;
  readonly newThreadId: () => ThreadId;
  readonly newMessageId: () => MessageId;
  readonly now: () => string;
}

const RUNTIME = { runtimeMode: "auto", interactionMode: "default" } as const;

const isLive = (thread: VoiceThreadShell) =>
  thread.archivedAt === null && thread.deletedAt === null;

export async function createVoiceThread(deps: VoiceSessionDeps, projectId: ProjectId) {
  const threadId = deps.newThreadId();
  await deps.startTurn({
    threadId,
    message: {
      messageId: deps.newMessageId(),
      role: "user",
      text: VOICE_ROLE_PROMPT,
      attachments: [],
    },
    modelSelection: VOICE_TIER_MODEL.synthesis,
    ...RUNTIME,
    bootstrap: {
      createThread: {
        projectId,
        title: VOICE_THREAD_TITLE,
        modelSelection: VOICE_TIER_MODEL.synthesis,
        ...RUNTIME,
        branch: null,
        worktreePath: null,
        createdAt: deps.now(),
      },
    },
  });
  await deps.waitForThread(threadId);
  await deps.pinAndKeep(threadId);
  deps.remember({ threadId, projectId });
  return threadId;
}

async function ensureVoiceThread(deps: VoiceSessionDeps): Promise<ThreadId | null> {
  const projectId = await deps.projectlessProject();
  const home = deps.home();
  // A voice thread remembered from before voice was projectless (it lives in a real project)
  // is left alone and replaced by a fresh one under "No project".
  if (
    home !== undefined &&
    home.projectId === projectId &&
    deps.threads().some((thread) => thread.id === home.threadId && isLive(thread))
  ) {
    return home.threadId;
  }
  if (home !== undefined) deps.forget();
  return projectId === null ? null : createVoiceThread(deps, projectId);
}

const tierOf = (selection: ModelSelection): VoiceTier =>
  selection.model === VOICE_TIER_MODEL.control.model ? "control" : "synthesis";

/** The transcript's whisper metadata as a file attachment; a failed upload never blocks the message. */
async function transcriptAttachments(
  deps: VoiceSessionDeps,
  metadata: VoiceTranscriptMetadata | undefined,
): Promise<ChatAttachment[]> {
  if (metadata === undefined || deps.uploadFile === undefined) return [];
  const attachment = await deps.uploadFile(voiceTranscriptMetaFile(metadata)).catch(() => null);
  return attachment === null ? [] : [attachment];
}

async function sendVoiceUtterance(
  deps: VoiceSessionDeps,
  threadId: ThreadId,
  text: string,
  metadata?: VoiceTranscriptMetadata,
): Promise<VoiceTier> {
  const [modelSelection, attachments] = await Promise.all([
    deps.route(text),
    transcriptAttachments(deps, metadata),
  ]);
  const live = withVoiceLiveState(text, voiceLiveThreads(deps.threads(), threadId));
  await deps.startTurn({
    threadId,
    message: {
      messageId: deps.newMessageId(),
      role: "user",
      text: live.text,
      attachments,
      context: { version: 1, records: live.records },
    },
    modelSelection,
    ...RUNTIME,
    dispatchMode: "queue",
  });
  return tierOf(modelSelection);
}

async function submit(
  deps: VoiceSessionDeps,
  text: string,
  metadata?: VoiceTranscriptMetadata,
): Promise<VoiceSubmitResult> {
  try {
    const threadId = await ensureVoiceThread(deps);
    if (threadId === null) {
      return {
        status: "error",
        code: "no-project",
        detail: 'This machine has no "No project" folder for the voice thread.',
      };
    }
    const tier = await sendVoiceUtterance(deps, threadId, text, metadata);
    return { status: "sent", tier };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "error", code: "send-failed", detail };
  }
}

let tail: Promise<unknown> = Promise.resolve();

/** Voice work runs strictly in order, so creating or replacing the thread never races itself. */
export function enqueueVoiceWork<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work);
  tail = next.catch(() => undefined);
  return next;
}

export function submitVoiceUtterance(
  deps: VoiceSessionDeps,
  text: string,
  metadata?: VoiceTranscriptMetadata,
): Promise<VoiceSubmitResult> {
  return enqueueVoiceWork(() => submit(deps, text.trim(), metadata));
}
