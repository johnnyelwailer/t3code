import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { VoiceThreadShell } from "./t3team-voiceLiveState";
import { VOICE_ROLE_PROMPT } from "./t3team-voiceRolePrompt";
import { VOICE_TIER_MODEL } from "./t3team-voiceRouting";
import { submitVoiceUtterance, type VoiceSessionDeps } from "./t3team-voiceSession";
import type { VoiceThreadHome } from "./t3team-voiceThreadStore";

const PROJECT = ProjectId.make("project-no-project");
const REAL_PROJECT = ProjectId.make("project-nexi-ai");

const shell = (id: string, overrides: Partial<VoiceThreadShell> = {}): VoiceThreadShell => ({
  id: ThreadId.make(id),
  title: id,
  updatedAt: "2026-10-19T10:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  settledAt: null,
  hasPendingUserInput: false,
  hasPendingApprovals: false,
  latestRun: null,
  ...overrides,
});

function harness(
  initial: {
    home?: VoiceThreadHome;
    threads?: VoiceThreadShell[];
    project?: ProjectId | null;
  } = {},
) {
  const turns: StartThreadTurnInput[] = [];
  const calls: string[] = [];
  const state = { home: initial.home, threads: initial.threads ?? [] };
  let ids = 0;
  const deps: VoiceSessionDeps = {
    threads: () => state.threads,
    home: () => state.home,
    remember: (home) => {
      state.home = home;
      calls.push("remember");
    },
    forget: () => {
      state.home = undefined;
      calls.push("forget");
    },
    projectlessProject: async () => (initial.project === undefined ? PROJECT : initial.project),
    route: async (text) => VOICE_TIER_MODEL[text.startsWith("stop") ? "control" : "synthesis"],
    startTurn: async (input) => {
      turns.push(input);
      calls.push(`turn:${input.bootstrap === undefined ? "send" : "create"}`);
      if (input.bootstrap !== undefined) state.threads = [...state.threads, shell(input.threadId)];
    },
    pinAndKeep: async () => {
      calls.push("pin");
    },
    release: async () => {
      calls.push("release");
    },
    waitForThread: async () => undefined,
    newThreadId: () => ThreadId.make(`voice-${++ids}`),
    newMessageId: () => MessageId.make(`message-${++ids}`),
    now: () => "2026-10-19T10:00:00.000Z",
  };
  return { deps, turns, calls, state };
}

describe("submitVoiceUtterance", () => {
  it("creates the voice thread on first use with the role as its first message, then queues the utterance", async () => {
    const { deps, turns, calls, state } = harness({
      threads: [shell("other", { title: "Fix login" })],
    });
    expect(await submitVoiceUtterance(deps, "what is blocked")).toEqual({
      status: "sent",
      tier: "synthesis",
    });
    expect(calls).toEqual(["turn:create", "pin", "remember", "turn:send"]);
    expect(turns[0]?.message.text).toBe(VOICE_ROLE_PROMPT);
    expect(turns[0]?.bootstrap?.createThread?.projectId).toBe(PROJECT);
    expect(turns[0]?.bootstrap?.createThread?.title).toBe("Voice");
    expect(state.home?.projectId).toBe(PROJECT);
    expect(turns[1]?.threadId).toBe(state.home?.threadId);
    expect(turns[1]?.dispatchMode).toBe("queue");
  });

  it("reports the tier each utterance was routed to", async () => {
    const { deps } = harness({ threads: [shell("other")] });
    expect(await submitVoiceUtterance(deps, "stop the docs thread")).toEqual({
      status: "sent",
      tier: "control",
    });
    expect(await submitVoiceUtterance(deps, "summarize it")).toEqual({
      status: "sent",
      tier: "synthesis",
    });
  });

  it("sends each utterance with its routed per-message model and the live state", async () => {
    const { deps, turns } = harness({ threads: [shell("other", { title: "Fix login" })] });
    await submitVoiceUtterance(deps, "stop the docs thread");
    await submitVoiceUtterance(deps, "summarize the auth work");
    const [, control, synthesis] = turns;
    expect(control?.modelSelection).toEqual(VOICE_TIER_MODEL.control);
    expect(synthesis?.modelSelection).toEqual(VOICE_TIER_MODEL.synthesis);
    expect(control?.message.text).toContain("stop the docs thread");
    expect(control?.message.text).toContain("t3-context://v1/voice-state/");
    expect(control?.message.context?.records[0]).toMatchObject({
      kind: "voice-state",
      payload: { activeThreads: 1, threads: [{ id: "other", title: "Fix login", status: "idle" }] },
    });
  });

  it("reuses the stored thread instead of creating another", async () => {
    const home = { threadId: ThreadId.make("voice-existing"), projectId: PROJECT };
    const { deps, turns, calls } = harness({ home, threads: [shell("voice-existing")] });
    await submitVoiceUtterance(deps, "hello");
    expect(calls).toEqual(["turn:send"]);
    expect(turns[0]?.threadId).toBe(home.threadId);
  });

  it("recreates the thread when the stored one was archived or deleted", async () => {
    const home = { threadId: ThreadId.make("voice-old"), projectId: PROJECT };
    const { deps, calls, state } = harness({
      home,
      threads: [shell("voice-old", { archivedAt: "2026-10-18T10:00:00.000Z" })],
    });
    await submitVoiceUtterance(deps, "hello");
    expect(calls).toEqual(["forget", "turn:create", "pin", "remember", "turn:send"]);
    expect(state.home?.threadId).not.toBe(home.threadId);
  });

  it("replaces a voice thread remembered in a real project with one under No project", async () => {
    const home = { threadId: ThreadId.make("voice-in-project"), projectId: REAL_PROJECT };
    const { deps, turns, calls, state } = harness({ home, threads: [shell("voice-in-project")] });
    await submitVoiceUtterance(deps, "hello");
    expect(calls).toEqual(["forget", "turn:create", "pin", "remember", "turn:send"]);
    expect(turns[0]?.bootstrap?.createThread?.projectId).toBe(PROJECT);
    expect(state.home?.projectId).toBe(PROJECT);
    expect(state.home?.threadId).not.toBe(home.threadId);
  });

  it("reports a failed No project lookup as a send failure and retries on the next utterance", async () => {
    const { deps, turns } = harness();
    let attempts = 0;
    const flaky = {
      ...deps,
      projectlessProject: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("scratch unavailable");
        return PROJECT;
      },
    };
    expect(await submitVoiceUtterance(flaky, "one")).toEqual({
      status: "error",
      code: "send-failed",
      detail: "scratch unavailable",
    });
    expect(await submitVoiceUtterance(flaky, "two")).toEqual({ status: "sent", tier: "synthesis" });
    expect(turns[0]?.bootstrap?.createThread?.projectId).toBe(PROJECT);
  });

  it("reports no-project when the machine offers no No project folder", async () => {
    const { deps, turns } = harness({ project: null });
    expect(await submitVoiceUtterance(deps, "hello")).toMatchObject({
      status: "error",
      code: "no-project",
    });
    expect(turns).toEqual([]);
  });

  it("reports a failed send and keeps processing later utterances", async () => {
    const home = { threadId: ThreadId.make("voice-existing"), projectId: PROJECT };
    const { deps, turns } = harness({ home, threads: [shell("voice-existing")] });
    const failing = { ...deps, startTurn: async () => Promise.reject(new Error("offline")) };
    expect(await submitVoiceUtterance(failing, "one")).toEqual({
      status: "error",
      code: "send-failed",
      detail: "offline",
    });
    expect(await submitVoiceUtterance(deps, "two")).toEqual({ status: "sent", tier: "synthesis" });
    expect(turns).toHaveLength(1);
  });

  it("creates the thread once when two utterances arrive back to back", async () => {
    const { deps, calls } = harness();
    await Promise.all([submitVoiceUtterance(deps, "one"), submitVoiceUtterance(deps, "two")]);
    expect(calls.filter((call) => call === "turn:create")).toHaveLength(1);
    expect(calls.filter((call) => call === "turn:send")).toHaveLength(2);
  });
});
