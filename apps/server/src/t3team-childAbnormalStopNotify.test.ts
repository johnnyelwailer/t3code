import {
  type OrchestrationCommand,
  type OrchestrationThread,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  buildAbnormalStopDetail,
  findHandoffParentThreadId,
  makeChildAbnormalStopNotifier,
  type HandoffActivityLike,
} from "./t3team-childAbnormalStopNotify.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

const handoff = (payload: unknown): HandoffActivityLike => ({
  kind: "t3team.handoff.created",
  payload,
});

describe("findHandoffParentThreadId", () => {
  it("reads the parent from a start-child handoff", () => {
    expect(findHandoffParentThreadId([handoff({ parentThreadId: "parent-1" })])).toBe("parent-1");
  });
  it("is null without a handoff activity", () => {
    expect(
      findHandoffParentThreadId([{ kind: "t3team.child_wait.registered", payload: {} }]),
    ).toBeNull();
    expect(findHandoffParentThreadId([])).toBeNull();
  });
  it("skips workflow-owned children (workflowRunId in payload)", () => {
    expect(
      findHandoffParentThreadId([handoff({ parentThreadId: "launcher", workflowRunId: "run-1" })]),
    ).toBeNull();
  });
  it("prefers the newest handoff and ignores malformed payloads", () => {
    expect(
      findHandoffParentThreadId([
        handoff({ parentThreadId: "old-parent" }),
        handoff({ parentThreadId: 42 }),
        handoff({ parentThreadId: "new-parent" }),
      ]),
    ).toBe("new-parent");
    expect(findHandoffParentThreadId([handoff(null), handoff(undefined)])).toBeNull();
  });
});

describe("buildAbnormalStopDetail", () => {
  it("is null when there is nothing to report", () => {
    expect(buildAbnormalStopDetail({ lastError: null, childStatus: null })).toBeNull();
    expect(buildAbnormalStopDetail({ lastError: "  ", childStatus: undefined })).toBeNull();
  });
  it("renders reason and last-known state, omitting the empty half", () => {
    expect(buildAbnormalStopDetail({ lastError: "provider timeout", childStatus: null })).toBe(
      "Reason: provider timeout",
    );
    expect(buildAbnormalStopDetail({ lastError: null, childStatus: "editing src/app.ts" })).toBe(
      "Last known state: editing src/app.ts",
    );
    expect(buildAbnormalStopDetail({ lastError: "boom", childStatus: "editing src/app.ts" })).toBe(
      "Reason: boom; Last known state: editing src/app.ts",
    );
  });
});

const childThread = (over: Partial<OrchestrationThread> = {}): OrchestrationThread =>
  ({
    id: ThreadId.make("child-1"),
    projectId: ProjectId.make("project-1"),
    title: "Implement the thing",
    activities: [handoff({ parentThreadId: "parent-1" })],
    childStatus: "editing src/app.ts",
    ...over,
  }) as unknown as OrchestrationThread;

type TerminalInput = { outcome: "failed" | "aborted" | "completed"; lastError: string | null };

const runNotifier = (
  child: OrchestrationThread | undefined,
  input: TerminalInput = { outcome: "failed", lastError: "provider timeout" },
  dispatchError?: Error,
  parent?: OrchestrationThread,
): { dispatches: OrchestrationCommand[]; effect: Effect.Effect<void> } => {
  const dispatches: OrchestrationCommand[] = [];
  const engine = {
    dispatch: (command: OrchestrationCommand) =>
      dispatchError ? Effect.fail(dispatchError) : Effect.sync(() => dispatches.push(command)),
  } as unknown as OrchestrationEngineShape;
  const details = new Map<string, OrchestrationThread>();
  if (child !== undefined) details.set("child-1", child);
  if (parent !== undefined) details.set("parent-1", parent);
  const query = {
    getThreadDetailById: (id: unknown) => {
      const found = details.get(String(id));
      return Effect.succeed(found === undefined ? Option.none() : Option.some(found));
    },
  } as unknown as ProjectionSnapshotQueryShape;
  const notifier = makeChildAbnormalStopNotifier({ engine, query });
  return { dispatches, effect: notifier({ childThreadId: "child-1", ...input }) };
};

const actorMessage = (command: OrchestrationCommand) => {
  if (command.type !== "thread.actor.message") throw new Error(`got ${command.type}`);
  return command;
};

const EXPECTED_HEAD =
  "[Child stopped abnormally] Child «Implement the thing» (thread child-1) stopped abnormally ";

describe("makeChildAbnormalStopNotifier", () => {
  it.effect("dispatches one actor message to the handoff parent with the detail", () =>
    Effect.gen(function* () {
      const { dispatches, effect } = runNotifier(childThread());
      yield* effect;
      expect(dispatches).toHaveLength(1);
      const command = actorMessage(dispatches[0]!);
      expect(command.threadId).toBe(ThreadId.make("parent-1"));
      expect(command.fromThreadId).toBe(ThreadId.make("child-1"));
      expect(command.urgency).toBe("urgent");
      expect(command.hopCount).toBe(0);
      expect(command.text).toBe(
        EXPECTED_HEAD +
          "(failed). It did not complete. Reason: provider timeout; " +
          "Last known state: editing src/app.ts.",
      );
    }),
  );

  it.effect("omits the detail when nothing is known and labels aborted stops", () =>
    Effect.gen(function* () {
      const { dispatches, effect } = runNotifier(childThread({ childStatus: null }), {
        outcome: "aborted",
        lastError: null,
      });
      yield* effect;
      expect(dispatches).toHaveLength(1);
      expect(actorMessage(dispatches[0]!).text).toBe(
        EXPECTED_HEAD + "(was aborted). It did not complete.",
      );
    }),
  );

  it.effect("dispatches nothing for a non-child thread or a missing thread", () =>
    Effect.gen(function* () {
      const notChild = runNotifier(childThread({ activities: [] }));
      yield* notChild.effect;
      expect(notChild.dispatches).toHaveLength(0);
      const missing = runNotifier(undefined);
      yield* missing.effect;
      expect(missing.dispatches).toHaveLength(0);
    }),
  );

  it.effect("never raises a dispatch failure into the event stream", () =>
    Effect.gen(function* () {
      // A throwing dispatch must be swallowed (logged), not raised into the caller.
      const { effect } = runNotifier(
        childThread(),
        { outcome: "failed", lastError: null },
        new Error("boom"),
      );
      yield* effect;
    }),
  );
});

const parentThread = (
  messages: Array<{ readonly role: string; readonly t3teamExt?: unknown }> = [],
): OrchestrationThread =>
  ({
    id: ThreadId.make("parent-1"),
    projectId: ProjectId.make("project-1"),
    title: "Parent",
    messages,
    activities: [],
  }) as unknown as OrchestrationThread;

describe("makeChildAbnormalStopNotifier silent-completion (outcome: completed)", () => {
  it.effect("notifies the parent when a child completes and the parent received nothing", () =>
    Effect.gen(function* () {
      const { dispatches, effect } = runNotifier(
        childThread(),
        { outcome: "completed", lastError: null },
        undefined,
        parentThread(),
      );
      yield* effect;
      expect(dispatches).toHaveLength(1);
      const command = actorMessage(dispatches[0]!);
      expect(command.threadId).toBe(ThreadId.make("parent-1"));
      expect(command.fromThreadId).toBe(ThreadId.make("child-1"));
      expect(command.text).toContain("[Child completed silently]");
      expect(command.text).toContain('op:"sweep"');
    }),
  );

  it.effect(
    "stays silent when the child already reported (parent holds an actor message from it)",
    () =>
      Effect.gen(function* () {
        const { dispatches, effect } = runNotifier(
          childThread(),
          { outcome: "completed", lastError: null },
          undefined,
          parentThread([{ role: "actor", t3teamExt: { actor: { senderThreadId: "child-1" } } }]),
        );
        yield* effect;
        expect(dispatches).toHaveLength(0);
      }),
  );

  it.effect("fires at most once per terminal epoch: our own notice is the dedup marker", () =>
    Effect.gen(function* () {
      // The parent already holds the silent-completion notice we sent for this
      // terminal — a redelivered completed event must not send a second one.
      const { dispatches, effect } = runNotifier(
        childThread(),
        { outcome: "completed", lastError: null },
        undefined,
        parentThread([{ role: "actor", t3teamExt: { actor: { senderThreadId: "child-1" } } }]),
      );
      yield* effect;
      expect(dispatches).toHaveLength(0);
    }),
  );

  it.effect("plan-mode child awaiting approval gets the explicit approval wording", () =>
    Effect.gen(function* () {
      const { dispatches, effect } = runNotifier(
        childThread({
          interactionMode: "plan",
          latestTurn: { state: "completed", turnId: "turn-1" } as never,
          proposedPlans: [
            { id: "p1", turnId: "turn-1", implementedAt: null, updatedAt: "t1" },
          ] as never,
        }),
        { outcome: "completed", lastError: null },
        undefined,
        parentThread(),
      );
      yield* effect;
      expect(dispatches).toHaveLength(1);
      const command = actorMessage(dispatches[0]!);
      expect(command.text).toContain("[Child awaiting your approval]");
      expect(command.text).toContain("NOT implemented");
      expect(command.text).not.toContain("[Child completed silently]");
    }),
  );

  it.effect("dispatches nothing when the parent detail cannot be loaded", () =>
    Effect.gen(function* () {
      const { dispatches, effect } = runNotifier(childThread(), {
        outcome: "completed",
        lastError: null,
      });
      yield* effect;
      expect(dispatches).toHaveLength(0);
    }),
  );
});
