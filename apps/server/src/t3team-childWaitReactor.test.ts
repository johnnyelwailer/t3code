/**
 * GHE #157 / GHE #55 follow-up reactor wiring: abnormal child stops notify the
 * parent when NO wait is registered; a SILENT completion notifies only after the
 * child has stayed quiet for the (default) quiet period, and is suppressed when
 * the child resumes (a running -> ready -> running inter-turn cycle is idle, not
 * a completion). The regression test below is built from the real misfire
 * evidence (thread 588daa42): the child went ready at 07:03:35, was notified at
 * 07:03:36 (1s), then resumed at 07:03:44 (8.7s) — the notice must NOT fire when
 * the child resumes within the quiet period.
 */
import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationThread,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeChildWaitReactor, type ChildWaitReactor } from "./t3team-childWaitReactor.ts";
import { COMPLETION_QUIET_PERIOD_MS } from "./t3team-childCompletionQuiet.ts";
import { type ChildWaitClock } from "./t3team-childWaitScheduler.ts";

const CHILD = "child-1";
const PARENT = "parent-1";
const TITLE = "Implement the thing";
const STATE = "editing src/app.ts";

const childDetail = (over: Record<string, unknown> = {}) =>
  ({
    id: ThreadId.make(CHILD),
    projectId: "project-1",
    title: TITLE,
    activities: [{ kind: "t3team.handoff.created", payload: { parentThreadId: PARENT } }],
    childStatus: STATE,
    messages: [],
    latestTurn: null,
    interactionMode: "default",
    proposedPlans: [],
    ...over,
  }) as unknown as OrchestrationThread;

const parentDetail = (over: Record<string, unknown> = {}) =>
  ({
    id: ThreadId.make(PARENT),
    projectId: "project-1",
    title: "Parent",
    messages: [],
    activities: [],
    ...over,
  }) as unknown as OrchestrationThread;

// Default details for scenarios that don't override them: the child resolves to
// its handoff-to-PARENT detail, the parent to a clean transcript.
const defaultDetails = (): ReadonlyMap<string, OrchestrationThread> =>
  new Map([
    [CHILD, childDetail()],
    [PARENT, parentDetail()],
  ]);

// "running" shell (so a late-registered wait does not resolve immediately) carrying the detail.
const childShell = {
  id: ThreadId.make(CHILD),
  projectId: "project-1",
  title: TITLE,
  session: { status: "running", lastError: "provider timeout" },
  latestTurn: null,
  childStatus: STATE,
} as unknown as OrchestrationThread;

const sessionSet = (status: string, lastError: string | null, seq = 0): OrchestrationEvent =>
  ({
    type: "thread.session-set",
    sequence: seq,
    payload: { threadId: ThreadId.make(CHILD), session: { status, lastError } },
  }) as unknown as OrchestrationEvent;

const waitRegistered = (): OrchestrationEvent =>
  ({
    type: "thread.activity-appended",
    payload: {
      threadId: ThreadId.make(PARENT),
      activity: {
        kind: "t3team.child_wait.registered",
        payload: { waitId: "w1", childThreadId: CHILD, childTitle: TITLE, on: "terminal" },
      },
    },
  }) as unknown as OrchestrationEvent;

// ── Fake clock (shared by the wait-deadline scheduler and the quiet gate) ──
function makeFakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const clock: ChildWaitClock = {
    now: () => nowMs,
    setTimer: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { due: nowMs + delayMs, callback });
      return id;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    advance: (ms: number) => {
      nowMs += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.due <= nowMs)
        .sort((a, b) => a[1].due - b[1].due);
      for (const [id, t] of due) {
        timers.delete(id);
        t.callback();
      }
    },
  };
}

interface Harness {
  readonly dispatches: OrchestrationCommand[];
  readonly reactor: ChildWaitReactor;
  readonly advance: (ms: number) => void;
}

function makeHarness(
  details: ReadonlyMap<string, OrchestrationThread> = defaultDetails(),
  replayed: OrchestrationEvent[] = [],
): Harness {
  const dispatches: OrchestrationCommand[] = [];
  const engine = {
    streamDomainEvents: Stream.empty,
    readEvents: () => Stream.fromIterable(replayed),
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command);
        return { sequence: dispatches.length };
      }),
  } as unknown as OrchestrationEngineShape;
  const query = {
    getThreadDetailById: (id: unknown) => {
      const found = details.get(String(id));
      return Effect.succeed(found === undefined ? Option.none() : Option.some(found));
    },
    getThreadShellById: () => Effect.succeed(Option.some(childShell)),
  } as unknown as ProjectionSnapshotQueryShape;
  const fake = makeFakeClock();
  // Uses the DEFAULT quiet period — the regression test pins the default, not a
  // caller-supplied zero.
  const reactor = makeChildWaitReactor({ engine, query, clock: fake.clock });
  return { dispatches, reactor, advance: fake.advance };
}

/** Let the fire-and-forget quiet-period notice (run in its own runtime) settle. */
const settle = () =>
  Effect.gen(function* () {
    for (let i = 0; i < 200; i += 1) yield* Effect.yieldNow;
  });

const texts = (dispatches: OrchestrationCommand[]): string[] =>
  dispatches.flatMap((c) => (c.type === "thread.actor.message" ? [c.text] : []));

const urgencies = (dispatches: OrchestrationCommand[]): string[] =>
  dispatches.flatMap((c) =>
    c.type === "thread.actor.message" ? [(c as { urgency?: string }).urgency ?? "normal"] : [],
  );

const markerCount = (dispatches: OrchestrationCommand[]): number =>
  dispatches.filter(
    (c) =>
      c.type === "thread.activity.append" &&
      (c as { activity?: { kind?: string } }).activity?.kind ===
        "t3team.child_abnormal_stop_notified",
  ).length;

describe("makeChildWaitReactor abnormal-stop notification", () => {
  it.effect("notifies the parent when a child dies with NO wait registered", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("error", "provider timeout"));
      yield* settle();
      const messages = texts(h.dispatches);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child stopped abnormally]");
      expect(messages[0]).toContain("Reason: provider timeout");
      expect(messages[0]).toContain("Last known state: editing src/app.ts");
      // A dead child is urgent.
      expect(urgencies(h.dispatches)).toEqual(["urgent"]);
    }),
  );

  it.effect("does NOT add a standalone message when a matching wait resolves", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(waitRegistered());
      yield* h.reactor.handleEvent(sessionSet("error", "provider timeout"));
      yield* settle();
      const messages = texts(h.dispatches);
      // Exactly ONE inter-agent message: the wait-resolution (with detail), not a duplicate.
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child wait");
      expect(messages[0]).toContain("Reason: provider timeout");
      expect(messages[0]).not.toContain("[Child stopped abnormally]");
      expect(
        h.dispatches.some(
          (c) =>
            c.type === "thread.activity.append" &&
            (c as { activity?: { kind?: string } }).activity?.kind === "t3team.child_wait.resolved",
        ),
      ).toBe(true);
    }),
  );
});

describe("makeChildWaitReactor silent-completion notice", () => {
  it.effect("tells the parent to decide once a child stays quiet after settling", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("running", null, 1));
      yield* h.reactor.handleEvent(sessionSet("idle", null, 2));
      // Not yet quiet enough — no notice before the period elapses.
      h.advance(COMPLETION_QUIET_PERIOD_MS - 1000);
      yield* settle();
      expect(texts(h.dispatches)).toHaveLength(0);
      // Past the quiet period: the child has genuinely stayed quiet.
      h.advance(2000);
      yield* settle();
      const messages = texts(h.dispatches);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child completed silently]");
      expect(messages[0]).toContain('op:"sweep"');
      // A normal completion is NON-urgent (it joins the burst fold, GHE #157).
      expect(urgencies(h.dispatches)).toEqual(["normal"]);
    }),
  );

  it.effect("stays silent when the child already reported to the parent", () =>
    Effect.gen(function* () {
      const h = makeHarness(
        new Map([
          [CHILD, childDetail()],
          [
            PARENT,
            parentDetail({
              messages: [
                {
                  role: "actor",
                  t3teamExt: { actor: { senderThreadId: CHILD } },
                },
              ],
            }),
          ],
        ]),
      );
      yield* h.reactor.handleEvent(sessionSet("idle", null));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      expect(texts(h.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("stays silent when a registered wait resolves the completion", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(waitRegistered());
      yield* h.reactor.handleEvent(sessionSet("idle", null));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      const messages = texts(h.dispatches);
      // Only the wait-resolution message — the completion notice stays out.
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child wait");
      expect(messages[0]).not.toContain("[Child completed silently]");
    }),
  );

  it.effect("names the pending plan when a plan-mode child awaits approval", () =>
    Effect.gen(function* () {
      const h = makeHarness(
        new Map([
          [
            CHILD,
            childDetail({
              interactionMode: "plan",
              latestTurn: { state: "completed", turnId: "turn-1" },
              proposedPlans: [{ id: "p1", turnId: "turn-1", implementedAt: null, updatedAt: "t1" }],
            }),
          ],
          [PARENT, parentDetail()],
        ]),
      );
      yield* h.reactor.handleEvent(sessionSet("idle", null));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      const messages = texts(h.dispatches);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child awaiting your approval]");
      expect(messages[0]).not.toContain("[Child completed silently]");
    }),
  );
});

describe("makeChildWaitReactor completion quiet period (misfire regression)", () => {
  // The real misfire evidence (thread 588daa42): running -> ready (07:03:35) ->
  // running (07:03:44). The old code notified at ready (1s) — a false "silent
  // completion". With the quiet period, the resume CANCELS the pending notice.
  it.effect("running -> ready -> running (resume within the quiet period) = ZERO notices", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("running", null, 1));
      yield* h.reactor.handleEvent(sessionSet("ready", null, 2));
      // The child resumed 8.7s after settling — far inside the default period.
      h.advance(8_700);
      yield* settle();
      yield* h.reactor.handleEvent(sessionSet("running", null, 3));
      // Advance well past the period: the timer was cancelled on resume, so
      // nothing may fire.
      h.advance(COMPLETION_QUIET_PERIOD_MS * 2);
      yield* settle();
      expect(texts(h.dispatches)).toHaveLength(0);
      expect(markerCount(h.dispatches)).toBe(0);
    }),
  );

  it.effect("a settle that stays quiet past the period notifies once, then re-arms", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("running", null, 1));
      yield* h.reactor.handleEvent(sessionSet("ready", null, 2));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      // The quiet elapse fired exactly one completion notice.
      expect(texts(h.dispatches)).toHaveLength(1);
      expect(texts(h.dispatches)[0]).toContain("[Child completed silently]");
      // A SECOND settle in the same epoch does not re-fire (ledger dedup).
      yield* h.reactor.handleEvent(sessionSet("ready", null, 3));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      expect(texts(h.dispatches)).toHaveLength(1);
      // ...until the child resumes (new epoch) and settles+stays quiet again.
      yield* h.reactor.handleEvent(sessionSet("running", null, 4));
      yield* h.reactor.handleEvent(sessionSet("idle", null, 5));
      h.advance(COMPLETION_QUIET_PERIOD_MS + 1000);
      yield* settle();
      expect(texts(h.dispatches)).toHaveLength(2);
      expect(urgencies(h.dispatches)).toEqual(["normal", "normal"]);
    }),
  );

  it.effect(
    "an inter-turn idle does NOT notify; a later genuine death still does (new epoch)",
    () =>
      Effect.gen(function* () {
        const h = makeHarness();
        yield* h.reactor.handleEvent(sessionSet("idle", null, 1));
        yield* h.reactor.handleEvent(sessionSet("running", null, 2)); // cancels the idle notice
        yield* h.reactor.handleEvent(sessionSet("error", "provider timeout", 3));
        h.advance(COMPLETION_QUIET_PERIOD_MS + 1000); // no pending completion remains
        yield* settle();
        const messages = texts(h.dispatches);
        // The inter-turn idle was cancelled; only the genuine death notifies.
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child stopped abnormally]");
        expect(messages[0]).not.toContain("[Child completed silently]");
        expect(urgencies(h.dispatches)).toEqual(["urgent"]);
      }),
  );
});

describe("makeChildWaitReactor epoch-scoped durable dedup (abnormal stop)", () => {
  it.effect("notifies ONCE when two terminal session-sets land in the same stop-epoch", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("interrupted", "provider timeout", 1));
      yield* h.reactor.handleEvent(sessionSet("interrupted", "provider timeout", 2));
      yield* settle();
      const standalone = texts(h.dispatches).filter((m) =>
        m.includes("[Child stopped abnormally]"),
      );
      expect(standalone).toHaveLength(1);
      expect(markerCount(h.dispatches)).toBe(1);
    }),
  );

  it.effect("re-notifies when the child resumes (new epoch) and then stops again", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("interrupted", "first stop", 1));
      yield* h.reactor.handleEvent(sessionSet("running", null, 2));
      yield* h.reactor.handleEvent(sessionSet("interrupted", "second stop", 3));
      yield* settle();
      const standalone = texts(h.dispatches).filter((m) =>
        m.includes("[Child stopped abnormally]"),
      );
      expect(standalone).toHaveLength(2);
      expect(markerCount(h.dispatches)).toBe(2);
    }),
  );

  it.effect(
    "does NOT fire a spurious standalone when a persisted wait covers the terminal event",
    () =>
      Effect.gen(function* () {
        const h = makeHarness(defaultDetails(), [waitRegistered()]);
        yield* h.reactor.rehydrate;
        yield* h.reactor.handleEvent(sessionSet("error", "provider timeout", 5));
        yield* settle();
        const messages = texts(h.dispatches);
        // The rehydrated (persisted) wait resolves the terminal event, so no
        // standalone — this is the fork-before-rehydrate race (Fix 2).
        expect(messages.filter((m) => m.includes("[Child stopped abnormally]"))).toHaveLength(0);
        expect(messages.some((m) => m.includes("[Child wait"))).toBe(true);
      }),
  );
});
