/**
 * The handler of `t3_machine_set_source`: normalizes and proves the proposal
 * (`MachineSourceProposal`), then posts it as ONE `t3_ask_user` question whose id carries the
 * proposal, so the web client can apply the user's accept on their own environment. Nothing is
 * saved here.
 *
 * @module t3team-machineSourceHandler
 */
import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  MACHINE_SOURCE_QUESTION_HEADER,
  encodeMachineSourceQuestionId,
  escapeMarkdownText,
  machineSourceQuestionLine,
  stripInvisibleFormat,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { MachineSourceProposal } from "../../../project/t3team-MachineSourceProposal.ts";
import { readCaller } from "../../threadAccess.ts";
import { t3TeamAskUser } from "./t3team-askUser.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";

const MAX_WHY_LENGTH = 500;
const MAX_AUTHOR_LENGTH = 100;
const NOTE =
  "Nothing is saved until the user accepts; the answer arrives as the user's next message.";

const refuse = (message: string) => new T3TeamMcpToolError({ message });
const oneLine = (text: string) => stripInvisibleFormat(text).replace(/\s+/g, " ").trim();

/** The handler, with the proposal check resolved once when the toolkit layer is built (the server
 * always has it; a toolkit test layer without it gets a clear refusal). */
export const makeMachineSetSourceHandler = Effect.gen(function* () {
  const proposal = Option.getOrUndefined(yield* Effect.serviceOption(MachineSourceProposal));
  return Effect.fn("T3TeamMcpToolkit.setMachineSource")(function* (input: {
    readonly repository: string;
    readonly branch?: string | undefined;
    readonly why: string;
    readonly author?: string | undefined;
  }) {
    if (!proposal) return yield* refuse("A machine source cannot be proposed on this server.");
    const { caller } = yield* readCaller();
    if (caller === undefined) {
      return yield* refuse("A machine source can only be proposed from a thread.");
    }
    const repository = input.repository.trim();
    const branch = input.branch?.trim();
    const why = oneLine(input.why);
    const author = oneLine(input.author ?? "").slice(0, MAX_AUTHOR_LENGTH);
    if (repository.length === 0) return yield* refuse("Name the repository to propose.");
    if (why.length === 0) return yield* refuse("Say why in 'why': the user reads it.");
    if (why.length > MAX_WHY_LENGTH) {
      return yield* refuse(`'why' must be at most ${MAX_WHY_LENGTH} characters.`);
    }
    const verified = yield* proposal
      .verify(caller.projectId, {
        repository,
        ...(branch === undefined || branch.length === 0 ? {} : { branch }),
      })
      .pipe(Effect.mapError((error) => refuse(error.message)));
    const asked = yield* t3TeamAskUser(
      {
        header: MACHINE_SOURCE_QUESTION_HEADER,
        // The first line is built from the proposal alone (the client requires it before it
        // applies an accepted answer); the agent's words are shown as plain text, never markdown.
        question: [
          machineSourceQuestionLine(verified.setting),
          ...(verified.commit === null
            ? []
            : [`Pinned at commit ${escapeMarkdownText(verified.commit.slice(0, 7))}.`]),
          ...(verified.ownHost === null || verified.ownHost === verified.host
            ? []
            : [
                escapeMarkdownText(
                  `Warning: ${verified.host} is not this project's repository host (${verified.ownHost}). Check it is the host you expect.`,
                ),
              ]),
          ...(author.length === 0 ? [] : [`Definition by: ${escapeMarkdownText(author)}`]),
          `Why: ${escapeMarkdownText(why)}`,
        ].join("\n\n"),
        options: [
          {
            label: MACHINE_SOURCE_ACCEPT_LABEL,
            description: "Saves this repository and branch as the project's machine source.",
          },
          {
            label: MACHINE_SOURCE_DECLINE_LABEL,
            description: "Leaves the project's machine source as it is.",
          },
        ],
        allowFreeText: false,
      },
      caller.id,
      encodeMachineSourceQuestionId(verified.setting),
    );
    return {
      asked: true as const,
      requestId: asked.requestId,
      questionId: asked.questionId,
      repository: verified.repository,
      branch: verified.branch,
      note: NOTE,
    };
  });
});
