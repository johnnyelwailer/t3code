/**
 * GHE #157 reactor wiring: an abnormal child session-set notifies the parent when NO wait is
 * registered (the previously-silent case), and adds no second message when a wait resolves it.
 */
import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationThread,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { T3TeamChildWaitReactorLive } from "./t3team-childWaitReactor.ts";

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

// Default details for scenarios that don't override them: the child resolves
// to its handoff-to-PARENT detail, the parent to a clean transcript.
const defaultDetails = (): Map<string, OrchestrationThread> =>
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

const makeEngine = (
  events: OrchestrationEvent[],
  dispatches: OrchestrationCommand[],
  replayed: OrchestrationEvent[] = [],
): OrchestrationEngineShape =>
  ({
    streamDomainEvents: Stream.fromIterable(events),
    readEvents: () => Stream.fromIterable(replayed),
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command);
        return { sequence: dispatches.length };
      }),
  }) as unknown as OrchestrationEngineShape;

const makeLayer = (
  engine: OrchestrationEngineShape,
  details: ReadonlyMap<string, OrchestrationThread> = defaultDetails(),
) =>
  T3TeamChildWaitReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getThreadDetailById: (id: unknown) => {
          const found = details.get(String(id));
          return Effect.succeed(found === undefined ? Option.none() : Option.some(found));
        },
        getThreadShellById: () => Effect.succeed(Option.some(childShell)),
      } as unknown as ProjectionSnapshotQueryShape),
    ),
  );

const texts = (dispatches: OrchestrationCommand[]): string[] =>
  dispatches.flatMap((c) => (c.type === "thread.actor.message" ? [c.text] : []));

const waitFor = (dispatches: OrchestrationCommand[], count: number) =>
  Effect.gen(function* () {
    // count 0 = negative scenario: give the reactor enough ticks to have
    // processed the events, then the caller asserts nothing was dispatched.
    for (let i = 0; i < 200 && (count === 0 || dispatches.length < count); i += 1) {
      yield* TestClock.adjust("10 millis");
      yield* Effect.yieldNow;
    }
    if (count > 0) expect(dispatches.length).toBeGreaterThanOrEqual(count);
  });

const markerCount = (dispatches: OrchestrationCommand[]): number =>
  dispatches.filter(
    (c) =>
      c.type === "thread.activity.append" &&
      (c as { activity?: { kind?: string } }).activity?.kind ===
        "t3team.child_abnormal_stop_notified",
  ).length;

const runScenario = (
  events: OrchestrationEvent[],
  count: number,
  assert: (dispatches: OrchestrationCommand[]) => void,
  replayed: OrchestrationEvent[] = [],
  details?: ReadonlyMap<string, OrchestrationThread>,
) =>
  Effect.gen(function* () {
    const dispatches: OrchestrationCommand[] = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(makeLayer(makeEngine(events, dispatches, replayed), details));
        yield* waitFor(dispatches, count);
        assert(dispatches);
      }),
    );
  });

describe("T3TeamChildWaitReactorLive abnormal-stop notification", () => {
  it.effect("notifies the parent when a child dies with NO wait registered", () =>
    runScenario(
      [sessionSet("error", "provider timeout")],
      1,
      (dispatches) => {
        const messages = texts(dispatches);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child stopped abnormally]");
        expect(messages[0]).toContain("Reason: provider timeout");
        expect(messages[0]).toContain("Last known state: editing src/app.ts");
      },
      [],
      defaultDetails(),
    ),
  );

  it.effect("does NOT add a standalone message when a matching wait resolves", () =>
    runScenario(
      [waitRegistered(), sessionSet("error", "provider timeout")],
      2,
      (dispatches) => {
        const messages = texts(dispatches);
        // Exactly ONE inter-agent message: the wait-resolution (with detail), not a duplicate.
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child wait");
        expect(messages[0]).toContain("Reason: provider timeout");
        expect(messages[0]).not.toContain("[Child stopped abnormally]");
        // The durable resolved activity is still appended.
        expect(
          dispatches.some(
            (c) =>
              c.type === "thread.activity.append" &&
              (c as { activity?: { kind?: string } }).activity?.kind ===
                "t3team.child_wait.resolved",
          ),
        ).toBe(true);
      },
      [],
      defaultDetails(),
    ),
  );

  it.effect(
    "notifies on a normal completion, then again after the child resumes and dies (child never reported)",
    () =>
      runScenario(
        [
          sessionSet("idle", null, 1),
          sessionSet("running", null, 2),
          sessionSet("error", "provider timeout", 3),
        ],
        4,
        (dispatches) => {
          const messages = texts(dispatches);
          // The completed turn gets the silent-completion notice; the later
          // death (new epoch after the resume) gets the abnormal-stop notice.
          expect(messages).toHaveLength(2);
          expect(messages[0]).toContain("[Child completed silently]");
          expect(messages[1]).toContain("[Child stopped abnormally]");
        },
        [],
        defaultDetails(),
      ),
  );
});

describe("T3TeamChildWaitReactorLive silent-completion notice", () => {
  it.effect("tells the parent to decide when a child completes without reporting", () =>
    runScenario(
      [sessionSet("idle", null)],
      1,
      (dispatches) => {
        const messages = texts(dispatches);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child completed silently]");
        expect(messages[0]).toContain('op:"sweep"');
      },
      [],
      defaultDetails(),
    ),
  );

  it.effect("stays silent when the child already reported to the parent", () =>
    runScenario(
      [sessionSet("idle", null)],
      0,
      (dispatches) => {
        expect(texts(dispatches)).toHaveLength(0);
      },
      [],
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
    ),
  );

  it.effect("stays silent when a registered wait resolves the completion", () =>
    runScenario(
      [waitRegistered(), sessionSet("idle", null)],
      2,
      (dispatches) => {
        const messages = texts(dispatches);
        // Only the wait-resolution message — the completion notice stays out.
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child wait");
        expect(messages[0]).not.toContain("[Child completed silently]");
      },
      [],
      defaultDetails(),
    ),
  );

  it.effect("names the pending plan when a plan-mode child awaits approval", () =>
    runScenario(
      [sessionSet("idle", null)],
      1,
      (dispatches) => {
        const messages = texts(dispatches);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child awaiting your approval]");
        expect(messages[0]).not.toContain("[Child completed silently]");
      },
      [],
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
    ),
  );

  // ── GHE #157 follow-up: epoch-scoped durable dedup (Fix 1) ────────────────

  it.effect("notifies ONCE when two terminal session-sets land in the same stop-epoch", () =>
    runScenario(
      [
        sessionSet("interrupted", "provider timeout", 1),
        sessionSet("interrupted", "provider timeout", 2),
      ],
      2,
      (dispatches) => {
        const standalone = texts(dispatches).filter((m) =>
          m.includes("[Child stopped abnormally]"),
        );
        // Two terminal events, ONE stop → exactly one standalone + one marker.
        expect(standalone).toHaveLength(1);
        expect(markerCount(dispatches)).toBe(1);
      },
    ),
  );

  it.effect("re-notifies when the child resumes (new epoch) and then stops again", () =>
    runScenario(
      [
        sessionSet("interrupted", "first stop", 1),
        sessionSet("running", null, 2),
        sessionSet("interrupted", "second stop", 3),
      ],
      4,
      (dispatches) => {
        const standalone = texts(dispatches).filter((m) =>
          m.includes("[Child stopped abnormally]"),
        );
        // A running transition starts a new epoch → the second stop notifies.
        expect(standalone).toHaveLength(2);
        expect(markerCount(dispatches)).toBe(2);
      },
    ),
  );

  it.effect(
    "does NOT fire a spurious standalone when a persisted wait covers the terminal event",
    () =>
      runScenario(
        [sessionSet("error", "provider timeout", 5)],
        2,
        (dispatches) => {
          const messages = texts(dispatches);
          // The rehydrated (persisted) wait resolves the terminal event, so no
          // standalone — this is the fork-before-rehydrate race (Fix 2).
          expect(messages.filter((m) => m.includes("[Child stopped abnormally]"))).toHaveLength(0);
          expect(messages.some((m) => m.includes("[Child wait"))).toBe(true);
        },
        [waitRegistered()],
      ),
  );
});
