/**
 * Pure half of `t3team_ask_user`: turns the tool input into one V2
 * `OrchestrationV2UserInputQuestion` plus soft authoring warnings.
 *
 * V2 questions carry no separate context field, so the `context` markdown is
 * placed above the question text (separated by a blank line): the dock card
 * still shows what the question is about, and the answer message the agent
 * receives ("<question>\n<answer>") carries it too.
 *
 * @module mcp/toolkits/t3team/t3team-askUserQuestion
 */
import type { OrchestrationV2UserInputQuestion } from "@t3tools/contracts";

export interface T3TeamAskUserOption {
  /** Short answer choice shown as the option button label. */
  readonly label: string;
  /** What the choice means and its trade-off — never just a restatement of the label. */
  readonly description?: string | undefined;
}

export interface T3TeamAskUserInput {
  /** Self-contained question; rendered on its own in the docked card. */
  readonly question: string;
  /** Markdown content from earlier in the thread the question refers to; shown above the question. */
  readonly context?: string | undefined;
  /** Short chip label (a few words) shown beside the question. */
  readonly header?: string | undefined;
  /** Answer choices as strings or {label, description} objects. */
  readonly options?: ReadonlyArray<string | T3TeamAskUserOption> | undefined;
  readonly multiSelect?: boolean | undefined;
  readonly allowFreeText?: boolean | undefined;
}

/** Normalize string-or-structured options; keep only non-empty labels. */
const normalizeAskUserOptions = (
  options: ReadonlyArray<string | T3TeamAskUserOption> | undefined,
): Array<{ readonly label: string; readonly description: string }> =>
  (options ?? [])
    .map((option) =>
      typeof option === "string"
        ? { label: option.trim(), description: option.trim() }
        : {
            label: option.label.trim(),
            description: option.description?.trim() || option.label.trim(),
          },
    )
    .filter((option) => option.label.length > 0);

/**
 * The V2 question (id = the caller-chosen question id) plus soft warnings, or
 * `{error}` when the input cannot form a question.
 */
export const buildAskUserQuestion = (
  input: T3TeamAskUserInput,
  questionId: string,
):
  | { readonly question: OrchestrationV2UserInputQuestion; readonly warnings: string[] }
  | { readonly error: string } => {
  const questionText = input.question.trim();
  if (questionText.length === 0) {
    return { error: "t3team_ask_user requires a non-empty 'question'." };
  }
  const contextText = (input.context ?? "").trim();
  const options = normalizeAskUserOptions(input.options);
  const header = (input.header ?? "").trim();

  // Soft feedback: an option whose description restates its label is almost
  // certainly an authoring error. Report, do not reject.
  const warnings = options
    .filter((option) => option.description === option.label)
    .map(
      (option) =>
        `option '${option.label}': its description restates the label — describe the trade-off instead`,
    );
  // A short question without context almost certainly points at earlier
  // thread content the dock card cannot show.
  if (questionText.length < 80 && contextText.length === 0) {
    warnings.push(
      "question references prior content but no context was provided — pass the referenced content in 'context'",
    );
  }

  return {
    question: {
      id: questionId,
      header: header.length > 0 ? header : "Question",
      question: contextText.length > 0 ? `${contextText}\n\n${questionText}` : questionText,
      options,
      multiSelect: input.multiSelect === true,
      ...(input.allowFreeText === false && options.length > 0 ? { allowCustomAnswer: false } : {}),
    },
    warnings,
  };
};
