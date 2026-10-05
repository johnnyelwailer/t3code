/**
 * The author agent's turn texts. Static knowledge (the generated reference) rides the FIRST turn;
 * the live catalog comes from the author's own `t3team_models` tool; the task comes from the
 * parent's `intent`/`args`. Nothing here is built into a system prompt — a thread turn is the only
 * instruction seam a child has, and that is the one used.
 */
import { WORKFLOW_AUTHOR_REFERENCE, type WorkflowRunIntent } from "@t3team/sdk";

import { WORKFLOW_REPORTING_CONTRACT } from "./t3team-workflowReportContract.ts";

/** Keep a pathological draft from blowing the author's context. */
const MAX_EMBEDDED_SOURCE_CHARS = 16_000;

const PROTOCOL = [
  "You are the orchestration author for a t3team run. Write the orchestration source that fulfils",
  "the intent below, then launch it. Work only through your tools:",
  "- t3team_models: the live provider instances and model slugs. Read it before naming any",
  '  `model`; natural-language constraints in the intent ("use cursor auto") map to an entry here.',
  "- t3team_recipe_validate({ source }): the full static check (format, determinism, runtime",
  "  bindings, capabilities, types, model slugs). Iterate until it reports no errors.",
  "- t3team_orchestration_run({ source, intent }): launches the validated source as THIS run. It",
  "  runs the same check and refuses with the findings if anything is still wrong; fix and call it",
  "  again. Call it successfully exactly once, then end your turn with one line.",
  "If the intent genuinely cannot be fulfilled as an orchestration, do not launch; end your turn",
  "with one line that says why — that line is reported to the caller.",
].join("\n");

const clip = (source: string): string =>
  source.length > MAX_EMBEDDED_SOURCE_CHARS
    ? `${source.slice(0, MAX_EMBEDDED_SOURCE_CHARS)}\n// … draft truncated (${source.length} chars total)`
    : source;

function intentBlock(intent: WorkflowRunIntent, args: unknown): string {
  return [
    `Goal: ${intent.goal}`,
    `Expected outcome: ${intent.expectedOutcome}`,
    `Guardrails (must hold): ${intent.guardrails.join(" | ")}`,
    `Launch args (what getArgs() returns): ${JSON.stringify(args ?? {})}`,
  ].join("\n");
}

export function buildWorkflowAuthorKickoff(input: {
  readonly intent: WorkflowRunIntent;
  readonly args: unknown;
  /** A parent-supplied draft, if any: a starting point, checked like anything else. */
  readonly draftSource?: string | undefined;
}): string {
  return [
    PROTOCOL,
    "## Intent",
    intentBlock(input.intent, input.args),
    ...(input.draftSource === undefined
      ? []
      : [
          "## Draft from the caller",
          "Start from this draft; validate it first and fix every finding before launching.",
          "```ts",
          clip(input.draftSource),
          "```",
        ]),
    WORKFLOW_AUTHOR_REFERENCE,
    WORKFLOW_REPORTING_CONTRACT,
  ].join("\n\n");
}

/** A later turn in the SAME conversation: the launched run failed and needs a corrected source. */
export function buildWorkflowAuthorRepairTurn(input: {
  readonly failure: string;
  readonly source: string;
  readonly priorReasons: ReadonlyArray<string>;
}): string {
  return [
    "The orchestration you launched failed at runtime and is paused at its last checkpoint.",
    `Failure: ${input.failure}`,
    ...(input.priorReasons.length === 0
      ? []
      : [`Earlier repair attempts failed: ${input.priorReasons.join(" | ")}`]),
    "Fix the source and submit it with t3team_orchestration_run({ source, intent }) — the same run",
    "resumes from its checkpoint with your corrected source (already-executed steps replay from the",
    "journal, so do not change them). Validate first. If it cannot be fixed, do not submit; end",
    "your turn with one line that says why.",
    "## Current source",
    "```ts",
    clip(input.source),
    "```",
  ].join("\n\n");
}
