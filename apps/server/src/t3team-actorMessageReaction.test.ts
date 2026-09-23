/**
 * Digest dispatch: one claimed mailbox batch becomes ONE `thread.turn.start`
 * reaction turn in the single digest framing — sender/subject/urgency per
 * message, short bodies inlined, long bodies as subject + t3team_read_message
 * pointer. The standing inter-agent protocol is appended only when
 * `includeStandingInstruction` (first digest of the session), and
 * `t3teamExt.actor.messageIds` ALWAYS names the whole batch — including
 * single-entry batches — so the restart rehydrate matches format-independently
 * (B4 invariant; see t3team-actorReactionInput.test.ts for the matching side).
 */
import type {
  OrchestrationCommand,
  OrchestrationMessage,
  OrchestrationThread,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationCommandIdConflictError } from "./orchestration/Errors.ts";
import { makeT3TeamActorMailbox, type T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import { startActorReaction } from "./t3team-actorMessageReaction.ts";
import { ACTOR_STANDING_INSTRUCTION, buildActorReactionDigestInput } from "./t3team-actorReactionInput.ts";
import { buildActorReactionTurnInput } from "./t3team-actorReactionVisibility.ts";

type TurnStart = Extract<OrchestrationCommand, { type: "thread.turn.start" }>;

const entry = (messageId: string): T3TeamActorMailboxEntry => ({
  messageId,
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  // Long on purpose: a short body would fit inside its own subject and defeat
  // the "body NOT loaded" assertions below.
  text: `update for ${messageId}. ` + "z".repeat(2000),
  urgency: "normal",
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
});

const makeThread = (): OrchestrationThread =>
  ({
    id: ThreadId.make("target"),
    session: { status: "idle" },
    latestTurn: null,
    modelSelection: null,
    runtimeMode: null,
    interactionMode: null,
    messages: [],
    activities: [],
  }) as unknown as OrchestrationThread;

const makeEngine = (dispatches: TurnStart[], fail?: boolean): OrchestrationEngineShape =>
  ({
    streamDomainEvents: undefined,
    readEvents: () => undefined,
    dispatch: (command: OrchestrationCommand) =>
      fail
        ? Effect.fail(
            new OrchestrationCommandIdConflictError({
              commandId: "cmd-conflict",
              receiptAggregateKind: "thread",
              receiptAggregateId: "target",
              commandAggregateKind: "thread",
              commandAggregateId: "target",
            }),
          )
        : Effect.sync(() => {
            dispatches.push(command as TurnStart);
          }),
  }) as unknown as OrchestrationEngineShape;

const runReaction = (input: {
  readonly dispatches: TurnStart[];
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly includeStandingInstruction?: boolean;
  readonly fail?: boolean;
}) =>
  Effect.gen(function* () {
    const mailbox = yield* makeT3TeamActorMailbox;
    const dispatched = yield* startActorReaction({
      engine: makeEngine(input.dispatches, input.fail),
      mailbox,
      threadId: "target",
      loadThread: () => Effect.succeed(makeThread()),
      entries: input.entries,
      includeStandingInstruction: input.includeStandingInstruction ?? false,
    });
    return { mailbox, dispatched };
  });

describe("startActorReaction digest dispatch", () => {
  it.effect("claims one batch into ONE digest turn with inlined short bodies", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const shortA = { ...entry("m1"), text: "short first body" };
      const shortB = { ...entry("m2"), text: "short second body" };
      const { dispatched } = yield* runReaction({ dispatches, entries: [shortA, shortB] });
      expect(dispatched).toBe(true);
      expect(dispatches).toHaveLength(1);
      const text = (dispatches[0] as TurnStart).message.text;
      // Idle thread: no human-steering suffix; no briefing: no standing block.
      expect(text).toBe(buildActorReactionTurnInput([shortA, shortB], false));
      expect(text).toContain("[Inter-agent digest: 2 message(s)]");
      expect(text).toContain("short first body");
      expect(text).toContain("short second body");
      expect(text).not.toContain(ACTOR_STANDING_INSTRUCTION);
    }),
  );

  it.effect("long bodies arrive as subject + pointer, never raw", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({ dispatches, entries: [entry("m1"), entry("m2")] });
      const text = (dispatches[0] as TurnStart).message.text;
      expect(text).toContain("update for m1");
      expect(text).toContain("update for m2");
      expect(text).toContain("message id m1");
      expect(text).toContain("message id m2");
      expect(text).toContain("body NOT loaded");
      expect(text).toContain("t3team_read_message");
      expect(text).not.toContain("z".repeat(100));
    }),
  );

  it.effect("appends the standing instruction ONLY when includeStandingInstruction", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({
        dispatches,
        entries: [entry("m1")],
        includeStandingInstruction: true,
      });
      const text = (dispatches[0] as TurnStart).message.text;
      expect(text).toBe(buildActorReactionTurnInput([entry("m1")], true));
      expect(text.startsWith(buildActorReactionDigestInput([entry("m1")]))).toBe(true);
      expect(text).toContain(ACTOR_STANDING_INSTRUCTION);
      expect(text).toContain("verdict line plus an evidence path");
    }),
  );

  it.effect("ALWAYS sets actor.messageIds — including single-entry batches (B4 matching key)", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({ dispatches, entries: [entry("m1")] });
      const actor = (dispatches[0] as TurnStart).message.t3teamExt?.actor;
      expect(actor).toBeDefined();
      expect(actor?.messageIds).toEqual(["m1"]);
      const multi: TurnStart[] = [];
      yield* runReaction({ dispatches: multi, entries: [entry("m1"), entry("m2")] });
      expect((multi[0] as TurnStart).message.t3teamExt?.actor?.messageIds).toEqual(["m1", "m2"]);
    }),
  );

  it.effect("takes the batch's strongest urgency and hop count into the actor ext", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const urgent: T3TeamActorMailboxEntry = { ...entry("m2"), urgency: "urgent", hopCount: 5 };
      yield* runReaction({ dispatches, entries: [entry("m1"), urgent] });
      const actor = (dispatches[0] as TurnStart).message.t3teamExt?.actor;
      expect(actor?.urgency).toBe("urgent");
      expect(actor?.hopCount).toBe(5);
      expect(actor?.senderThreadId).toBe("sender");
    }),
  );

  it.effect("requeues the claimed batch on dispatch failure, returns false, releases the flag", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const { mailbox, dispatched } = yield* runReaction({
        dispatches,
        entries: [entry("m1"), entry("m2")],
        fail: true,
      });
      expect(dispatched).toBe(false);
      expect(dispatches).toHaveLength(0);
      expect(yield* mailbox.isReacting("target")).toBe(false);
      const requeued = yield* mailbox.takeNextForDispatch("target");
      expect(requeued.map((e) => e.messageId)).toEqual(["m1", "m2"]);
      expect(requeued.every((e) => e.dispatchAttempts === 1)).toBe(true);
      yield* mailbox.clearReacting("target");
    }),
  );
});
