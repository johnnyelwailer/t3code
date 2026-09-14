// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type SentBeat = { readonly environmentId: unknown; readonly threadId: string };

const { sentBeats, mockState } = vi.hoisted(() => ({
  sentBeats: [] as SentBeat[],
  mockState: { environmentId: "env-1" as string | null },
}));

vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createEnvironmentRpcCommand: (_runtime: unknown, options: { label: string }) => ({
    label: options.label,
  }),
  runAtomCommand: async (
    _registry: unknown,
    _command: unknown,
    input: { environmentId: unknown; input: { threadId: string } },
  ) => {
    sentBeats.push({ environmentId: input.environmentId, threadId: String(input.input.threadId) });
    return { _tag: "Success", value: { ok: true } };
  },
}));
vi.mock("~/connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => mockState.environmentId },
}));
vi.mock("~/state/primaryEnvironment", () => ({
  primaryEnvironmentIdAtom: Symbol("primaryEnvironmentIdAtom"),
}));

import { reportThreadComposing } from "./t3team-threadComposingSignal";

beforeEach(() => {
  sentBeats.length = 0;
  mockState.environmentId = "env-1";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reportThreadComposing (per-thread composing heartbeat)", () => {
  it("sends a beat for the FIRST keystroke in a thread and throttles rapid follow-ups", () => {
    reportThreadComposing("thread-1");
    expect(sentBeats).toEqual([{ environmentId: "env-1", threadId: "thread-1" }]);

    // Keystrokes inside the 4s throttle send nothing — the last beat is fresh.
    for (let i = 0; i < 50; i += 1) {
      vi.advanceTimersByTime(50);
      reportThreadComposing("thread-1");
    }
    expect(sentBeats).toHaveLength(1);
  });

  it("re-sends while typing continues past the throttle", () => {
    // Fresh thread id: the module-level beat map persists across tests, and
    // every test starts at the same fake wall-clock time.
    reportThreadComposing("thread-2"); // beat at t=0
    vi.advanceTimersByTime(3_900);
    reportThreadComposing("thread-2"); // t=3.9s: still throttled
    vi.advanceTimersByTime(100); // t=4.0s
    reportThreadComposing("thread-2");
    // The throttle (4s) fired the second beat — a long typing session keeps
    // the server's 15s lapse window alive.
    expect(sentBeats.map((beat) => beat.threadId)).toEqual(["thread-2", "thread-2"]);
  });

  it("sends one trailing beat after the input settles", () => {
    reportThreadComposing("thread-3"); // beat at t=0
    vi.advanceTimersByTime(3_000);
    reportThreadComposing("thread-3"); // t=3s: throttled (no beat)
    // 1.5s after that keystroke the trailing beat fires: 4.5s since the last
    // send is well past the half-throttle duplicate guard.
    vi.advanceTimersByTime(1_500);
    expect(sentBeats).toHaveLength(2);
    // The trailing beat is a one-shot: no more after it.
    vi.advanceTimersByTime(10_000);
    expect(sentBeats).toHaveLength(2);
  });

  it("keeps pacing PER THREAD: typing in thread A does not throttle thread B", () => {
    reportThreadComposing("thread-a"); // beat A at t=0
    reportThreadComposing("thread-b"); // beat B at t=0 — NOT throttled by A
    expect(sentBeats.map((beat) => beat.threadId)).toEqual(["thread-a", "thread-b"]);

    vi.advanceTimersByTime(3_000);
    reportThreadComposing("thread-a"); // throttled (A's t=0 beat)
    reportThreadComposing("thread-b"); // throttled (B's t=0 beat)
    vi.advanceTimersByTime(1_500); // t=4.5s: BOTH trailing beats fire
    expect(sentBeats.map((beat) => beat.threadId)).toEqual([
      "thread-a",
      "thread-b",
      "thread-a",
      "thread-b",
    ]);
  });

  it("scopes pacing per ENVIRONMENT + thread: the same thread id on two environments does not throttle each other", () => {
    reportThreadComposing("thread-x"); // env-1 beat at t=0
    mockState.environmentId = "env-2";
    reportThreadComposing("thread-x"); // env-2 beat at t=0 — NOT throttled by env-1's beat
    mockState.environmentId = "env-1";
    expect(
      sentBeats.map((beat) => `${beat.environmentId}:${beat.threadId}`),
    ).toEqual(["env-1:thread-x", "env-2:thread-x"]);
    // env-1's beat still throttles env-1's next keystroke on the same thread.
    reportThreadComposing("thread-x");
    expect(sentBeats).toHaveLength(2);
  });

  it("sends nothing and tracks no pacing when no environment is paired", () => {
    mockState.environmentId = null;
    reportThreadComposing("thread-x");
    vi.advanceTimersByTime(30_000);
    expect(sentBeats).toHaveLength(0);
    // Pairing an environment later starts fresh (no stale pacing state).
    mockState.environmentId = "env-1";
    reportThreadComposing("thread-y");
    expect(sentBeats).toHaveLength(1);
  });

  it("is a no-op for draft-only targets (null / empty thread id)", () => {
    reportThreadComposing(null);
    reportThreadComposing(undefined);
    reportThreadComposing("");
    vi.advanceTimersByTime(30_000);
    expect(sentBeats).toHaveLength(0);
  });
});
