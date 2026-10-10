/**
 * The SEND half of inter-agent mailbox delivery: the host implementation of
 * the `t3_thread_send` mode "mailbox" hook (mcp/t3team-threadMailboxDelivery.ts).
 *
 * The message is recorded durably for the recipient and a drain is nudged;
 * it reaches the recipient later, batched into one digest run
 * (t3team-actorMailboxDelivery.ts). Loop guard: every message carries a hop
 * count — a human-started run sends hop 0, a reply sent from a digest run
 * sends that digest's highest hop + 1. Past `T3TEAM_ACTOR_MESSAGE_HOP_CAP`
 * the message is only shown in the recipient's timeline (a run-less message
 * with the sender attached) and never wakes it, so agent ping-pong cannot run
 * away.
 *
 * @module t3team-actorMailboxSend
 */
import { OrchestratorMcpFailure, type OrchestrationV2Run, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type {
  ThreadMailboxSendInput,
  ThreadMailboxSendResult,
} from "./mcp/t3team-threadMailboxDelivery.ts";
import type { T3TeamActorMailboxStore } from "./t3team-actorMailbox.ts";
import { MAILBOX_DIGEST_PREFIX } from "./t3team-actorMailboxDelivery.ts";
import { T3TEAM_ACTOR_MESSAGE_HOP_CAP } from "./t3team-actorMessageReactorLimits.ts";
import { capActorMessageSummary } from "./t3team-actorReactionInputSummarize.ts";
import type { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";

export interface MailboxSendDeps {
  readonly store: T3TeamActorMailboxStore["Service"];
  /** The sender's title and runs (for the reply context). */
  readonly loadSender: (threadId: ThreadId) => Effect.Effect<{
    readonly title: string;
    readonly runs: ReadonlyArray<Pick<OrchestrationV2Run, "ordinal" | "status" | "userMessageId">>;
  } | null>;
  readonly recordMessage: T3TeamThreadMessageRecorder["Service"]["record"];
  /** Nudges delivery for the recipient (fire-and-forget). */
  readonly nudge: (threadId: string) => Effect.Effect<void>;
  readonly nowIso: () => string;
}

const ACTIVE_RUN_STATUSES: ReadonlySet<string> = new Set(["starting", "running", "waiting"]);

/** The run a tool call comes from: the active one, else the latest. */
const currentRun = <R extends Pick<OrchestrationV2Run, "ordinal" | "status">>(
  runs: ReadonlyArray<R>,
): R | undefined => {
  const ordered = [...runs].toSorted((left, right) => right.ordinal - left.ordinal);
  return ordered.find((run) => ACTIVE_RUN_STATUSES.has(run.status)) ?? ordered[0];
};

const isMcpFailure = Schema.is(OrchestratorMcpFailure);

const failure = (message: string) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message });

export const makeMailboxSend =
  (deps: MailboxSendDeps) =>
  (input: ThreadMailboxSendInput): Effect.Effect<ThreadMailboxSendResult, OrchestratorMcpFailure> =>
    Effect.gen(function* () {
      if (input.senderThreadId === input.targetThreadId) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "A thread cannot send a mailbox message to itself.",
        });
      }
      const sender = yield* deps.loadSender(input.senderThreadId);
      if (sender === null)
        return yield* failure(`Sender thread ${input.senderThreadId} was not found.`);
      const run = currentRun(sender.runs);
      const reply =
        run !== undefined && run.userMessageId.startsWith(MAILBOX_DIGEST_PREFIX)
          ? yield* deps.store.replyContext(run.userMessageId)
          : null;
      const hopCount = reply === null ? 0 : reply.hopCount + 1;
      const summary = input.summary === undefined ? "" : capActorMessageSummary(input.summary);
      const entry = {
        messageId: input.messageId,
        toThreadId: input.targetThreadId,
        fromThreadId: input.senderThreadId,
        fromTitle: sender.title,
        text: input.text,
        ...(summary === "" ? {} : { summary }),
        urgency: input.urgent ? ("urgent" as const) : ("normal" as const),
        hopCount,
        rootThreadId: reply?.rootThreadId ?? input.senderThreadId,
        createdAt: deps.nowIso(),
      };
      if (hopCount > T3TEAM_ACTOR_MESSAGE_HOP_CAP) {
        yield* deps.store.enqueue(entry, "surfaced");
        yield* deps.recordMessage({
          threadId: input.targetThreadId,
          messageId: input.messageId,
          role: "user",
          createdBy: "agent",
          creationSource: "mcp",
          senderThreadId: input.senderThreadId,
          text: input.text,
        });
        return {
          state: "surfaced" as const,
          note:
            `Loop guard: this message chain reached ${hopCount} agent hops, so it was shown in ` +
            "the recipient's timeline without waking it.",
        };
      }
      if (yield* deps.store.enqueue(entry)) yield* deps.nudge(input.targetThreadId);
      return { state: "queued" as const };
    }).pipe(
      Effect.catch((cause) =>
        isMcpFailure(cause)
          ? Effect.fail(cause)
          : Effect.fail(failure(`Unable to queue the mailbox message: ${String(cause)}`)),
      ),
    );
