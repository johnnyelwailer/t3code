/**
 * One voice utterance from transcript to the voice thread: make sure the thread exists (created
 * on first use with the role prompt as its first message, always under "No project", never in
 * whichever project happens to be open or listed first), then send it with the thread's composer
 * model and the fresh live state. The model follows the composer's selection (Auto is optional,
 * not forced). While a voice turn is running, utterances queue behind it (no interrupt).
 */
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { ProviderInstanceId } from "@t3tools/contracts";
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
import { voiceTranscriptMetaFile } from "./t3team-voiceTranscriptMeta";
import type { VoiceThreadHome } from "./t3team-voiceThreadStore";

/** The voice thread's starting model; the composer can change it to any tier, including Auto. */
const VOICE_DEFAULT_MODEL: ModelSelection = {
  instanceId: ProviderInstanceId.make("nexplore"),
  model: "low",
};

export type VoiceSubmitResult =
  | { readonly status: "sent" }
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
    modelSelection: VOICE_DEFAULT_MODEL,
    ...RUNTIME,
    bootstrap: {
      createThread: {
        projectId,
        title: VOICE_THREAD_TITLE,
        modelSelection: VOICE_DEFAULT_MODEL,
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

async function retireStaleHome(deps: VoiceSessionDeps, home: VoiceThreadHome) {
  deps.forget();
  const stillLive = deps.threads().some((thread) => thread.id === home.threadId && isLive(thread));
  if (stillLive) await deps.release(home.threadId).catch(() => undefined);
}

async function ensureVoiceThread(deps: VoiceSessionDeps): Promise<ThreadId | null> {
  const projectId = await deps.projectlessProject();
  const home = deps.home();
  if (
    home !== undefined &&
    home.projectId === projectId &&
    deps.threads().some((thread) => thread.id === home.threadId && isLive(thread))
  ) {
    return home.threadId;
  }
  if (home !== undefined) await retireStaleHome(deps, home);
  return projectId === null ? null : createVoiceThread(deps, projectId);
}

/** The transcript's whisper metadata as a file attachment; a failed upload never blocks the message. */
async function transcriptAttachments(
  deps: VoiceSessionDeps,
  metadata: VoiceTranscriptMetadata | undefined,
): Promise<ChatAttachment[]> {
  if (metadata === undefined || deps.uploadFile === undefined) return [];
  const attachment = await deps.uploadFile(voiceTranscriptMetaFile(metadata)).catch(() => null);
  return attachment === null ? [] : [attachment];
}

/**
 * Send the utterance to the voice thread with the thread's own composer model (no per-utterance
 * tier routing: a manual composer choice always wins, and Auto is just one pickable model).
 */
async function sendVoiceUtterance(
  deps: VoiceSessionDeps,
  threadId: ThreadId,
  text: string,
  metadata?: VoiceTranscriptMetadata,
): Promise<void> {
  const attachments = await transcriptAttachments(deps, metadata);
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
    ...RUNTIME,
    dispatchMode: "queue",
  });
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
    await sendVoiceUtterance(deps, threadId, text, metadata);
    return { status: "sent" };
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
