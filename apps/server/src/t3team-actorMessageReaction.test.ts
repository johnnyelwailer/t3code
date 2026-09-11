/**
 * Delivery tiers (anti-chatter): the thread's FIRST inter-agent delivery
 * carries full bodies (kickoff/handoff); every LATER delivery is header-only
 * with a t3team_read_message pointer; a user interjection while the batch was
 * queueing compresses the batch to "the user's message comes first" pointers.
 *
 * Each tier keeps the stable single-entry base format, so the restart-rehydrate
 * prefix-matching contract (collectPendingActorDeliveries) keeps working — see
 * t3team-actorReactionInput.test.ts for the matching side.
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
import {
  buildActorReactionBatchInput,
  buildActorReactionCompressedInput,
  buildActorReactionHeaderInput,
  buildActorReactionInput,
} from "./t3team-actorReactionInput.ts";
import {
  appendActorReactionUserReturnInstruction,
  detectUserFacingOpenState,
} from "./t3team-actorReactionVisibility.ts";

type TurnStart = Extract<OrchestrationCommand, { type: "thread.turn.start" }>;

const entry = (messageId: string): T3TeamActorMailboxEntry => ({
  messageId,
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  // Long on purpose: a short body would fit inside its own auto-summary and
  // defeat the "body NOT loaded" assertions below.
  text: `update for ${messageId}. ` + "z".repeat(2000),
  urgency: "normal",
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
});

const message = (partial: {
  role: OrchestrationMessage["role"];
  text?: string;
  createdAt?: string;
  t3teamExt?: OrchestrationMessage["t3teamExt"];
}): OrchestrationMessage =>
  ({
    role: partial.role,
    text: partial.text ?? "x",
    createdAt: partial.createdAt ?? "2026-07-19T07:00:00.000Z",
    ...(partial.t3teamExt !== undefined ? { t3teamExt: partial.t3teamExt } : {}),
  }) as unknown as OrchestrationMessage;

/** A transcript with an already-admitted inter-agent delivery (follow-up tier). */
const PRIOR_ACTOR_MESSAGES: ReadonlyArray<OrchestrationMessage> = [
  message({
    role: "user",
    text: "prior delivery framing",
    createdAt: "2026-07-19T07:30:00.000Z",
    t3teamExt: {
      visibleToUser: false,
      actor: {
        senderThreadId: "sender",
        urgency: "normal",
        hopCount: 1,
        rootThreadId: "root",
      },
    },
  }),
];

const makeThread = (
  messages: ReadonlyArray<OrchestrationMessage> | null | undefined,
): OrchestrationThread =>
  ({
    id: ThreadId.make("target"),
    session: { status: "idle" },
    latestTurn: null,
    modelSelection: null,
    runtimeMode: null,
    interactionMode: null,
    messages,
    activities: [],
  }) as unknown as OrchestrationThread;

const makeEngine = (dispatches: TurnStart[], fail?: boolean): OrchestrationEngineShape =>
  ({
    streamDomainEvents: undefined,
    readEvents: () => undefined,
    dispatch: (command: OrchestrationCommand) =>
      // Dispatch failures are TYPED OrchestrationDispatchErrors (a bare throw
      // would be an unrecoverable defect, not the error startActorReaction's
      // requeue handler recovers from).
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
  readonly thread: OrchestrationThread;
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly fail?: boolean;
}) =>
  Effect.gen(function* () {
    const mailbox = yield* makeT3TeamActorMailbox;
    yield* startActorReaction({
      engine: makeEngine(input.dispatches, input.fail),
      mailbox,
      threadId: "target",
      loadThread: () => Effect.succeed(input.thread),
      entries: input.entries,
    });
    return mailbox;
  });

describe("startActorReaction delivery tiers", () => {
  it.effect("the thread's FIRST inter-agent delivery carries full bodies", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({
        dispatches,
        thread: makeThread([]),
        entries: [entry("m1"), entry("m2")],
      });
      expect(dispatches).toHaveLength(1);
      const turn = dispatches[0] as TurnStart;
      // No user-facing exchange → no suffixes: the full-body batch base verbatim.
      expect(turn.message.text).toBe(buildActorReactionBatchInput([entry("m1"), entry("m2")]));
      // The kickoff delivery inlines the bodies (over-long ones arrive as the
      // summary + message-id marker — never the header-only pointer).
      expect(turn.message.text).toContain("…[summarized — ");
      expect(turn.message.text).toContain("message id m1");
      expect(turn.message.text).not.toContain("body NOT loaded");
    }),
  );

  it.effect("EVERY LATER delivery is header-only with a t3team_read_message pointer", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({
        dispatches,
        thread: makeThread(PRIOR_ACTOR_MESSAGES),
        entries: [entry("m1"), entry("m2")],
      });
      expect(dispatches).toHaveLength(1);
      const text = (dispatches[0] as TurnStart).message.text;
      expect(text).toBe(buildActorReactionHeaderInput([entry("m1"), entry("m2")]));
      // Headers, ids, and the fetch pointer — but NOT the bodies.
      expect(text).toContain("update for m1");
      expect(text).toContain("update for m2");
      expect(text).toContain("message id m1");
      expect(text).toContain("message id m2");
      expect(text).toContain("t3team_read_message");
      // Headers yes, bodies no.
      expect(text).not.toContain("z".repeat(100));
      // A single follow-up entry uses the exact single-entry base format.
      const single: TurnStart[] = [];
      yield* runReaction({
        dispatches: single,
        thread: makeThread(PRIOR_ACTOR_MESSAGES),
        entries: [entry("m1")],
      });
      expect((single[0] as TurnStart).message.text).toBe(
        buildActorReactionHeaderInput([entry("m1")]),
      );
    }),
  );

  it.effect("a user interjection while queueing compresses the batch to pointers", () =>
    Effect.gen(function* () {
      // Prior actor delivery + a real user message AFTER the batch queued:
      // open context AND user-interjected → compressed tier, with the
      // user-return instruction suffix (rehydrate prefix-matching kept).
      const messages = [
        ...PRIOR_ACTOR_MESSAGES,
        message({ role: "user", createdAt: "2026-07-19T08:05:00.000Z" }),
      ];
      const dispatches: TurnStart[] = [];
      yield* runReaction({
        dispatches,
        thread: makeThread(messages),
        entries: [entry("m1"), entry("m2")],
      });
      expect(dispatches).toHaveLength(1);
      const text = (dispatches[0] as TurnStart).message.text;
      const base = buildActorReactionCompressedInput([entry("m1"), entry("m2")]);
      expect(
        text ===
          appendActorReactionUserReturnInstruction(base, detectUserFacingOpenState(messages)),
      ).toBe(true);
      expect(text.startsWith(base)).toBe(true);
      expect(text).toContain("the user's message comes FIRST");
      expect(text).toContain("Do not act on these by default");
      expect(text).not.toContain("z".repeat(100));
    }),
  );

  it.effect(
    "a follow-up batch without an interjection still gets the user-return instruction when the user has an open question",
    () =>
      Effect.gen(function* () {
        // Prior actor delivery + a real user message BEFORE the batch queued:
        // open context, but NOT interjected → header-only base + user-return
        // suffix (GHE #156 behavior preserved on the new tier).
        const messages = [
          message({ role: "user", createdAt: "2026-07-19T07:45:00.000Z" }),
          ...PRIOR_ACTOR_MESSAGES,
        ];
        const dispatches: TurnStart[] = [];
        yield* runReaction({
          dispatches,
          thread: makeThread(messages),
          entries: [entry("m1")],
        });
        expect(dispatches).toHaveLength(1);
        const text = (dispatches[0] as TurnStart).message.text;
        expect(
          text ===
            appendActorReactionUserReturnInstruction(
              buildActorReactionHeaderInput([entry("m1")]),
              detectUserFacingOpenState(messages),
            ),
        ).toBe(true);
        expect(text.startsWith(buildActorReactionHeaderInput([entry("m1")]))).toBe(true);
        expect(text).not.toContain("z".repeat(100));
      }),
  );

  it.effect("keeps single-first-delivery semantics byte-identical to the historical framing", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      yield* runReaction({ dispatches, thread: makeThread([]), entries: [entry("m1")] });
      expect((dispatches[0] as TurnStart).message.text).toBe(buildActorReactionInput(entry("m1")));
      expect(buildActorReactionBatchInput([entry("m1")])).toBe(
        buildActorReactionInput(entry("m1")),
      );
    }),
  );

  it.effect("requeues the claimed batch on dispatch failure and releases the reacting flag", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const mailbox = yield* runReaction({
        dispatches,
        thread: makeThread([]),
        entries: [entry("m1"), entry("m2")],
        fail: true,
      });
      expect(dispatches).toHaveLength(0);
      // The claim was released and the batch is requeued intact (attempts +1).
      expect(yield* mailbox.isReacting("target")).toBe(false);
      const requeued = yield* mailbox.takeNextForDispatch("target");
      expect(requeued).toHaveLength(2);
      expect(requeued.map((e) => e.messageId)).toEqual(["m1", "m2"]);
      expect(requeued.every((e) => e.dispatchAttempts === 1)).toBe(true);
      // Clean up the flag this assertion claim flipped on.
      yield* mailbox.clearReacting("target");
    }),
  );
});
