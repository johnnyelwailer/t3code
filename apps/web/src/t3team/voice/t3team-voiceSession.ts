/**
 * One voice utterance from transcript to the voice thread: route it to a tier, make sure the
 * thread exists (created on first use, in the project the hotkey fired in, with the role prompt
 * as its first message), then send it with the tier's model and the fresh live state. While a
 * voice turn is running, utterances queue behind it (existing queue semantics, no interrupt).
 */
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type { MessageId, ModelSelection, ProjectId, ThreadId } from "@t3tools/contracts";

import { VOICE_ROLE_PROMPT, VOICE_THREAD_TITLE } from "./t3team-voiceRolePrompt";
import {
  voiceLiveThreads,
  withVoiceLiveState,
  type VoiceThreadShell,
} from "./t3team-voiceLiveState";
import { VOICE_TIER_MODEL } from "./t3team-voiceRouting";
import type { VoiceThreadHome } from "./t3team-voiceThreadStore";

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
  /** The project the hotkey fired in, or null when no project is available. */
  readonly homeProject: () => ProjectId | null;
  readonly route: (text: string) => Promise<ModelSelection>;
  readonly startTurn: (input: StartThreadTurnInput) => Promise<void>;
  readonly pinAndKeep: (threadId: ThreadId) => Promise<void>;
  readonly waitForThread: (threadId: ThreadId) => Promise<void>;
  readonly newThreadId: () => ThreadId;
  readonly newMessageId: () => MessageId;
  readonly now: () => string;
}

const RUNTIME = { runtimeMode: "auto", interactionMode: "default" } as const;

const isLive = (thread: VoiceThreadShell) =>
  thread.archivedAt === null && thread.deletedAt === null;

async function createVoiceThread(deps: VoiceSessionDeps, projectId: ProjectId) {
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
  const home = deps.home();
  if (
    home !== undefined &&
    deps.threads().some((thread) => thread.id === home.threadId && isLive(thread))
  ) {
    return home.threadId;
  }
  if (home !== undefined) deps.forget();
  const projectId = deps.homeProject();
  return projectId === null ? null : createVoiceThread(deps, projectId);
}

async function sendVoiceUtterance(deps: VoiceSessionDeps, threadId: ThreadId, text: string) {
  const modelSelection = await deps.route(text);
  const live = withVoiceLiveState(text, voiceLiveThreads(deps.threads(), threadId));
  await deps.startTurn({
    threadId,
    message: {
      messageId: deps.newMessageId(),
      role: "user",
      text: live.text,
      attachments: [],
      context: { version: 1, records: live.records },
    },
    modelSelection,
    ...RUNTIME,
    dispatchMode: "queue",
  });
}

async function submit(deps: VoiceSessionDeps, text: string): Promise<VoiceSubmitResult> {
  try {
    const threadId = await ensureVoiceThread(deps);
    if (threadId === null) {
      return { status: "error", code: "no-project", detail: "Open a project to start voice." };
    }
    await sendVoiceUtterance(deps, threadId, text);
    return { status: "sent" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "error", code: "send-failed", detail };
  }
}

let tail: Promise<unknown> = Promise.resolve();

/** Utterances are processed strictly in order, so first-use creation never races itself. */
export function submitVoiceUtterance(
  deps: VoiceSessionDeps,
  text: string,
): Promise<VoiceSubmitResult> {
  const next = tail.then(() => submit(deps, text.trim()));
  tail = next.catch(() => undefined);
  return next;
}
