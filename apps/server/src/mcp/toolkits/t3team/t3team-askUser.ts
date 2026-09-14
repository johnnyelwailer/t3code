/**
 * t3team_ask_user — structured user questions on any t3team agent thread,
 * via the durable message-mode question path.
 *
 * The question is surfaced by appending a `user-input.requested` activity in
 * `responseMode: "message"` — the same async mechanism the provider adapters'
 * durable questions use. The tool does NOT suspend the turn: it returns as
 * soon as the question is persisted. From then on the question lives on the
 * thread (docked in the user's composer panel) until the user answers it —
 * it survives the asking turn ending, a session restart, and an app restart,
 * because the request is a durable activity and the shell's
 * hasPendingUserInput flag is recomputed from it on startup and on every
 * user-input activity. When the user answers, the decider's message mode
 * branch appends `user-input.resolved` and starts a new turn whose user
 * message carries "<question>\n<answer>".
 *
 * An agent can never cancel or discard a pending question: nothing finalizes
 * a resolved activity (this tool no longer suspends, so there is no
 * cancellation finalizer), and the message mode branch never emits
 * `thread.user-input-response-requested`, so the ProviderCommandReactor
 * side channel that stale-fails and clears provider-native questions can
 * never fire for this requestId.
 *
 * Guardrail: one pending question per thread. Before appending, the handler
 * reads the thread's user-input lifecycle (same query the shell pending
 * count uses) and refuses when a message-mode question is still open, naming
 * the outstanding requestId. The check-then-act is not atomic: two
 * back-to-back tool calls in the same turn can both pass the check before
 * either append lands. That race is ACCEPTED, not a bug to fix: the outcome
 * is two questions docked side by side, both visible to the user and both
 * answerable — neither can be silently discarded. Do not add a lock around
 * it; the durable single writer is the command journal, and locking would
 * only make a benign duplicate into a rejected call.
 *
 * @module mcp/toolkits/t3team/t3team-askUser
 */
import { randomUUID } from "node:crypto";

import {
  ApprovalRequestId,
  CommandId,
  EventId,
  ThreadId,
  UserInputQuestion,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionThreadActivityRepository,
} from "../../../persistence/Services/ProjectionThreadActivities.ts";
import { T3TeamMcpToolError } from "./tools.ts";
import { openMessageModeRequestIds } from "./t3team-askUserLifecycle.ts";

export interface T3TeamAskUserOption {
  /** Short answer choice shown as the option button label. */
  readonly label: string;
  /** What the choice means and its trade-off — never just a restatement of the label. */
  readonly description?: string | undefined;
}

export interface T3TeamAskUserInput {
  /** Full context plus the question itself; markdown is rendered in the panel. */
  readonly question: string;
  /** Short chip label (a few words) shown beside the question. */
  readonly header?: string | undefined;
  /** Answer choices as strings or {label, description} objects. */
  readonly options?: ReadonlyArray<string | T3TeamAskUserOption> | undefined;
  readonly multiSelect?: boolean | undefined;
  readonly allowFreeText?: boolean | undefined;
}

export interface T3TeamAskUserResult {
  /** The question is persisted on the thread and docked in the user's composer. */
  readonly delivered: true;
  /** Durable id of the pending question (the activity's payload.requestId). */
  readonly requestId: ApprovalRequestId;
  /** The question id draft answers are keyed by (equals the requestId). */
  readonly questionId: string;
  /** Soft authoring feedback (e.g. an option whose description restates its label). */
  readonly warnings?: ReadonlyArray<string> | undefined;
}

const toToolError = (message: string) => new T3TeamMcpToolError({ message });

/** Normalize string-or-structured options; keep only non-empty labels. */
const normalizeAskUserOptions = (
  options: ReadonlyArray<string | T3TeamAskUserOption> | undefined,
): Array<{ readonly label: string; readonly description: string }> =>
  (options ?? [])
    .map((option) =>
      typeof option === "string"
        ? { label: option.trim(), description: option.trim() }
        : { label: option.label.trim(), description: option.description?.trim() ?? option.label.trim() },
    )
    .filter((option) => option.label.length > 0);

export const t3TeamAskUser = Effect.fn("T3TeamMcpToolkit.askUser")(function* (
  input: T3TeamAskUserInput,
  threadId: ThreadId,
) {
  const questionText = input.question.trim();
  if (questionText.length === 0) {
    return yield* toToolError("t3team_ask_user requires a non-empty 'question'.");
  }

  const engine = yield* OrchestrationEngineService;
  const activityRepository = yield* ProjectionThreadActivityRepository;

  const pending = yield* activityRepository
    .listUserInputLifecycleByThreadId({ threadId })
    .pipe(Effect.mapError((error) => toToolError(`Failed to read pending questions: ${error}`)));

  const outstanding = openMessageModeRequestIds(pending);
  if (outstanding.length > 0) {
    // One pending question per thread. The agent cannot cancel or replace it
    // — it stays open until the user answers (or dismisses it in the panel).
    return yield* toToolError(
      `A question is already pending on this thread (requestId: ${outstanding[0]}). It stays ` +
        `open until the user answers or dismisses it; agents cannot cancel or replace pending ` +
        `questions. Answer it in the composer panel instead of asking again.`,
    );
  }

  const requestId = ApprovalRequestId.make(randomUUID());

  // `id` is the requestId — a short, stable identifier draft answers are
  // keyed by. The old build used the full question text as the id, which the
  // composer echoed back verbatim.
  const normalizedOptions = normalizeAskUserOptions(input.options);
  const userQuestion: UserInputQuestion = {
    id: requestId,
    header: (input.header ?? "").trim().length > 0 ? input.header!.trim() : "Question",
    question: questionText,
    options: normalizedOptions,
    multiSelect: input.multiSelect === true,
    // The composer reads allowCustomAnswer on the question; the old payload
    // carried allowFreeText at the top level where nothing consumed it.
    ...(input.allowFreeText === false ? { allowCustomAnswer: false } : {}),
  };

  // Soft feedback: options whose description just restates the label are
  // almost certainly authoring errors (the observed 1200-char misuse was
  // built exactly like this). Report, do not reject.
  const warnings = normalizedOptions
    .filter((option) => option.description === option.label)
    .map((option) => `option '${option.label}': its description restates the label — describe the trade-off instead`);

  const eventId = EventId.make(randomUUID());
  const createdAtIso = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));

  // Message mode: the decider's `thread.user-input.respond` branch resolves
  // this requestId durably and delivers the answer as a new-turn user message
  // instead of routing it through the provider session. turnId stays null so
  // the request is not flushed when the asking turn ends.
  yield* engine
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`mcp:t3team-ask-user:${requestId}:${eventId}`),
      threadId,
      activity: {
        id: eventId,
        createdAt: createdAtIso,
        tone: "info",
        kind: "user-input.requested",
        summary: "User input requested",
        payload: {
          requestId,
          questions: [userQuestion],
          responseMode: "message",
        },
        turnId: null,
      },
      createdAt: createdAtIso,
    })
    .pipe(
      Effect.mapError((error) =>
        toToolError(`Failed to record the user-input request activity: ${String(error)}`),
      ),
    );

  return {
    delivered: true,
    requestId,
    questionId: requestId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
});
