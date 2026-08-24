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

const childDetail = {
  id: ThreadId.make(CHILD),
  projectId: "project-1",
  title: TITLE,
  activities: [{ kind: "t3team.handoff.created", payload: { parentThreadId: PARENT } }],
  childStatus: STATE,
} as unknown as OrchestrationThread;

// "running" shell (so a late-registered wait does not resolve immediately) carrying the detail.
const childShell = {
  id: ThreadId.make(CHILD),
  projectId: "project-1",
  title: TITLE,
  session: { status: "running", lastError: "provider timeout" },
  latestTurn: null,
  childStatus: STATE,
} as unknown as OrchestrationThread;

const sessionSet = (status: string, lastError: string | null): OrchestrationEvent =>
  ({
    type: "thread.session-set",
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
): OrchestrationEngineShape =>
  ({
    streamDomainEvents: Stream.fromIterable(events),
    readEvents: () => Stream.empty,
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command);
        return { sequence: dispatches.length };
      }),
  }) as unknown as OrchestrationEngineShape;

const makeLayer = (engine: OrchestrationEngineShape) =>
  T3TeamChildWaitReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getThreadDetailById: () => Effect.succeed(Option.some(childDetail)),
        getThreadShellById: () => Effect.succeed(Option.some(childShell)),
      } as unknown as ProjectionSnapshotQueryShape),
    ),
  );

const texts = (dispatches: OrchestrationCommand[]): string[] =>
  dispatches.flatMap((c) => (c.type === "thread.actor.message" ? [c.text] : []));

const waitFor = (dispatches: OrchestrationCommand[], count: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < 200 && dispatches.length < count; i += 1) {
      yield* TestClock.adjust("10 millis");
      yield* Effect.yieldNow;
    }
    expect(dispatches.length).toBeGreaterThanOrEqual(count);
  });

const runScenario = (
  events: OrchestrationEvent[],
  count: number,
  assert: (dispatches: OrchestrationCommand[]) => void,
) =>
  Effect.gen(function* () {
    const dispatches: OrchestrationCommand[] = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(makeLayer(makeEngine(events, dispatches)));
        yield* waitFor(dispatches, count);
        assert(dispatches);
      }),
    );
  });

describe("T3TeamChildWaitReactorLive abnormal-stop notification", () => {
  it.effect("notifies the parent when a child dies with NO wait registered", () =>
    runScenario([sessionSet("error", "provider timeout")], 1, (dispatches) => {
      const messages = texts(dispatches);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("[Child stopped abnormally]");
      expect(messages[0]).toContain("Reason: provider timeout");
      expect(messages[0]).toContain("Last known state: editing src/app.ts");
    }),
  );

  it.effect("does NOT add a standalone message when a matching wait resolves", () =>
    runScenario([waitRegistered(), sessionSet("error", "provider timeout")], 2, (dispatches) => {
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
            (c as { activity?: { kind?: string } }).activity?.kind === "t3team.child_wait.resolved",
        ),
      ).toBe(true);
    }),
  );

  it.effect("stays silent on a normal completion, then notifies on the later abnormal stop", () =>
    runScenario(
      [sessionSet("idle", null), sessionSet("error", "provider timeout")],
      1,
      (dispatches) => {
        const messages = texts(dispatches);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[Child stopped abnormally]");
      },
    ),
  );
});
