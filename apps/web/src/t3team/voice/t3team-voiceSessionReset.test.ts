import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { VoiceThreadShell } from "./t3team-voiceLiveState";
import { VOICE_ROLE_PROMPT } from "./t3team-voiceRolePrompt";
import { VOICE_TIER_MODEL } from "./t3team-voiceRouting";
import { submitVoiceUtterance, type VoiceSessionDeps } from "./t3team-voiceSession";
import { startFreshVoiceThread } from "./t3team-voiceSessionReset";
import type { VoiceThreadHome } from "./t3team-voiceThreadStore";

const NO_PROJECT = ProjectId.make("project-no-project");

const shell = (id: string): VoiceThreadShell => ({
  id: ThreadId.make(id),
  title: id,
  updatedAt: "2026-10-22T08:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  settledAt: null,
  hasPendingUserInput: false,
  hasPendingApprovals: false,
  latestRun: null,
});

function harness(initial: { home?: VoiceThreadHome; project?: ProjectId | null } = {}) {
  const turns: StartThreadTurnInput[] = [];
  const calls: string[] = [];
  const state = {
    home: initial.home,
    threads: initial.home ? [shell(initial.home.threadId)] : ([] as VoiceThreadShell[]),
  };
  let ids = 0;
  const deps: VoiceSessionDeps = {
    threads: () => state.threads,
    home: () => state.home,
    remember: (home) => {
      state.home = home;
      calls.push(`remember:${home.threadId}`);
    },
    forget: () => {
      state.home = undefined;
      calls.push("forget");
    },
    projectlessProject: async () => (initial.project === undefined ? NO_PROJECT : initial.project),
    route: async () => VOICE_TIER_MODEL.synthesis,
    startTurn: async (input) => {
      turns.push(input);
      calls.push(`turn:${input.bootstrap === undefined ? "send" : "create"}`);
      if (input.bootstrap !== undefined) state.threads = [...state.threads, shell(input.threadId)];
    },
    pinAndKeep: async (threadId) => {
      calls.push(`pin:${threadId}`);
    },
    release: async (threadId) => {
      calls.push(`release:${threadId}`);
    },
    waitForThread: async () => undefined,
    newThreadId: () => ThreadId.make(`voice-new-${++ids}`),
    newMessageId: () => MessageId.make(`message-${++ids}`),
    now: () => "2026-10-22T08:00:00.000Z",
  };
  return { deps, turns, calls, state };
}

const OLD_HOME = { threadId: ThreadId.make("voice-old"), projectId: NO_PROJECT };

describe("startFreshVoiceThread", () => {
  it("creates a new voice thread under No project and moves the voice pointer to it", async () => {
    const { deps, turns, state } = harness({ home: OLD_HOME });
    const result = await startFreshVoiceThread(deps);
    expect(result.status).toBe("started");
    const created = turns[0];
    expect(created?.bootstrap?.createThread?.projectId).toBe(NO_PROJECT);
    expect(created?.message.text).toBe(VOICE_ROLE_PROMPT);
    expect(result).toEqual({ status: "started", threadId: created?.threadId });
    expect(state.home).toEqual({ threadId: created?.threadId, projectId: NO_PROJECT });
  });

  it("keeps the old thread as a normal thread: released, never archived or deleted", async () => {
    const { deps, calls, state } = harness({ home: OLD_HOME });
    await startFreshVoiceThread(deps);
    // New thread pinned and remembered first, then the old one let go.
    expect(calls).toEqual([
      "turn:create",
      "pin:voice-new-1",
      "remember:voice-new-1",
      "release:voice-old",
    ]);
    expect(state.threads.map((thread) => thread.id)).toContain("voice-old");
  });

  it("sends the next utterance to the fresh thread", async () => {
    const { deps, turns, state } = harness({ home: OLD_HOME });
    await startFreshVoiceThread(deps);
    await submitVoiceUtterance(deps, "what is blocked");
    expect(turns.at(-1)?.threadId).toBe(state.home?.threadId);
    expect(turns.at(-1)?.threadId).not.toBe(OLD_HOME.threadId);
  });

  it("works without a previous voice thread", async () => {
    const { deps, calls, state } = harness();
    expect((await startFreshVoiceThread(deps)).status).toBe("started");
    expect(calls).not.toContain(expect.stringMatching(/^release/));
    expect(state.home?.projectId).toBe(NO_PROJECT);
  });

  it("still starts fresh when releasing the old thread fails", async () => {
    const { deps, state } = harness({ home: OLD_HOME });
    const flaky = { ...deps, release: async () => Promise.reject(new Error("offline")) };
    expect((await startFreshVoiceThread(flaky)).status).toBe("started");
    expect(state.home?.threadId).not.toBe(OLD_HOME.threadId);
  });

  it("leaves the pointer alone when there is no No project folder", async () => {
    const { deps, turns, state } = harness({ home: OLD_HOME, project: null });
    expect(await startFreshVoiceThread(deps)).toMatchObject({
      status: "error",
      code: "no-project",
    });
    expect(turns).toEqual([]);
    expect(state.home).toEqual(OLD_HOME);
  });

  it("leaves the pointer alone when the new thread cannot be created", async () => {
    const { deps, state } = harness({ home: OLD_HOME });
    const failing = { ...deps, startTurn: async () => Promise.reject(new Error("offline")) };
    expect(await startFreshVoiceThread(failing)).toEqual({
      status: "error",
      code: "send-failed",
      detail: "offline",
    });
    expect(state.home).toEqual(OLD_HOME);
  });
});
