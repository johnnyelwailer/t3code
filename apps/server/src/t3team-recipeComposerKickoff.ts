/**
 * A recipe attached in the chat composer: the person's text lands as their own run-less message
 * (carrying `recipeKickoff`, so it is badged and never answers an ask), becomes the workflow's
 * `instructions` input, and the launch replies once the run is admitted.
 */
import {
  MessageId,
  type T3TeamMessageRecipeKickoff,
  type ThreadId,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";

/** The input name the bundled work-item workflows read the person's note from. */
const COMPOSER_KICKOFF_INSTRUCTIONS_PARAMETER = "instructions";

export function composerKickoffArgs(
  parameters: Readonly<Record<string, unknown>>,
  text: string,
): Record<string, unknown> {
  const note = text.trim();
  return note.length === 0
    ? { ...parameters }
    : { ...parameters, [COMPOSER_KICKOFF_INSTRUCTIONS_PARAMETER]: note };
}

export const recordComposerKickoffMessage = Effect.fn("recordComposerKickoffMessage")(
  function* (input: {
    readonly threadId: ThreadId;
    readonly messageId: string;
    readonly text: string;
    readonly recipeKickoff: T3TeamMessageRecipeKickoff;
  }) {
    yield* loadThreadProjectContext(input.threadId);
    const recorder = yield* T3TeamThreadMessageRecorder;
    const context = withT3TeamMessageExtContext({ recipeKickoff: input.recipeKickoff });
    return yield* recorder.record({
      threadId: input.threadId,
      messageId: MessageId.make(input.messageId),
      role: "user",
      text: input.text.trim() || input.recipeKickoff.title,
      creationSource: "web",
      ...(context === undefined ? {} : { context }),
    });
  },
);
