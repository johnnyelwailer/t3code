/**
 * t3_ask_user — structured user questions on any t3team agent thread.
 *
 * The question is recorded as a V2 message-capability runtime request on the
 * calling thread's active run (`T3TeamAskUserWriter`). The tool does NOT
 * suspend the turn: it returns as soon as the question is persisted. The
 * question then stays docked in the user's composer until they answer it —
 * it survives the asking turn ending and restarts. The answer arrives later as
 * a new user message "<question>\n<answer>" (upstream `runtime-request.respond`).
 *
 * One pending question per thread; an agent can never cancel or replace it.
 *
 * @module mcp/toolkits/t3team/t3team-askUser
 */
import * as NodeCrypto from "node:crypto";

import type { RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { T3TeamMcpToolError } from "./tools.ts";
import { buildAskUserQuestion, type T3TeamAskUserInput } from "./t3team-askUserQuestion.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";

export type { T3TeamAskUserInput, T3TeamAskUserOption } from "./t3team-askUserQuestion.ts";

export interface T3TeamAskUserResult {
  /** The question is persisted on the thread and docked in the user's composer. */
  readonly delivered: true;
  /** Durable id of the pending V2 runtime request. */
  readonly requestId: RuntimeRequestId;
  /** The question id answers are keyed by. */
  readonly questionId: string;
  /** Soft authoring feedback (e.g. an option whose description restates its label). */
  readonly warnings?: ReadonlyArray<string> | undefined;
}

export const t3TeamAskUser = Effect.fn("T3TeamMcpToolkit.askUser")(function* (
  input: T3TeamAskUserInput,
  threadId: ThreadId,
) {
  const askId = NodeCrypto.randomUUID();
  const built = buildAskUserQuestion(input, askId);
  if ("error" in built) {
    return yield* new T3TeamMcpToolError({ message: built.error });
  }
  const writer = yield* T3TeamAskUserWriter;
  const { requestId } = yield* writer
    .ask({ threadId, askId, questions: [built.question] })
    .pipe(Effect.mapError((error) => new T3TeamMcpToolError({ message: error.message })));
  return {
    delivered: true,
    requestId,
    questionId: built.question.id,
    ...(built.warnings.length > 0 ? { warnings: built.warnings } : {}),
  } satisfies T3TeamAskUserResult;
});
