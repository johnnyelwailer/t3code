/**
 * "Start fresh" on the voice row: a new voice conversation, created exactly like the first one
 * (under "No project", role prompt first, pinned and kept), and the voice pointer moves to it.
 * The old thread is not touched beyond its voice duties: it is unpinned and may settle again, so
 * it stays reachable in the list as an ordinary thread.
 *
 * Queued behind any utterance in flight, so an utterance never lands in a half-replaced thread.
 */
import type { ThreadId } from "@t3tools/contracts";

import { createVoiceThread, enqueueVoiceWork, type VoiceSessionDeps } from "./t3team-voiceSession";

export type VoiceResetResult =
  | { readonly status: "started"; readonly threadId: ThreadId }
  | {
      readonly status: "error";
      readonly code: "no-project" | "send-failed";
      readonly detail: string;
    };

async function startFresh(deps: VoiceSessionDeps): Promise<VoiceResetResult> {
  try {
    const projectId = await deps.projectlessProject();
    if (projectId === null) {
      return {
        status: "error",
        code: "no-project",
        detail: 'This machine has no "No project" folder for the voice thread.',
      };
    }
    const previous = deps.home();
    // The new thread first: the pointer never points at nothing.
    const threadId = await createVoiceThread(deps, projectId);
    if (previous !== undefined && previous.threadId !== threadId) {
      // Best effort: a thread that stays pinned is still a normal, reachable thread.
      await deps.release(previous.threadId).catch(() => undefined);
    }
    return { status: "started", threadId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "error", code: "send-failed", detail };
  }
}

export function startFreshVoiceThread(deps: VoiceSessionDeps): Promise<VoiceResetResult> {
  return enqueueVoiceWork(() => startFresh(deps));
}
