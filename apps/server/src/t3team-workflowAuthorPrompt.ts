/**
 * The author agent's turn texts. The compact reference (`WORKFLOW_AUTHOR_ESSENTIALS`) and the live
 * provider catalog snapshot (`t3team-workflowAuthorCatalog.ts`) ride the FIRST turn; the task comes
 * from the parent's `intent`/`args`. Nothing here is built into a system prompt — a thread turn is
 * the only instruction seam a child has, and that is the one used.
 *
 * The kickoff stays small on purpose (`t3team-workflowAuthorPrompt.test.ts` caps it): a small model
 * that gets a long manual reasons until its output budget is gone and never calls a tool.
 */
import { WORKFLOW_AUTHOR_ESSENTIALS, type WorkflowRunIntent } from "@t3team/sdk";

import type { ServerProvider } from "@t3tools/contracts";

import { formatWorkflowAuthorCatalog } from "./t3team-workflowAuthorCatalog.ts";

/** Keep a pathological draft from blowing the author's context. */
const MAX_EMBEDDED_SOURCE_CHARS = 16_000;

const PROTOCOL = [
  "You write and launch ONE orchestration: a TypeScript workflow for the intent below. Nobody",
  "reads this thread; only your tool calls count. Do this, in order:",
  "1. Write the complete source right away, starting from the template. Do not plan it out in",
  "   prose first — the validator is faster than reasoning about edge cases.",
  "2. Call t3_recipe_validate({ source }). Fix every listed error and validate again until it",
  "   returns ok: true.",
  "3. Call t3_orchestration_run({ source }) once. The run and its intent are already bound, so",
  "   pass only `source`. Then end your turn with one short line.",
  "If the intent cannot be done as an orchestration, do not launch: end your turn with one line",
  "saying why. This thread runs in plan mode only to withhold edit and shell tools; both tools",
  "above work. Never call ExitPlanMode or wait for approval — a successful run IS the approval.",
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
  /** The live provider snapshot at launch; absent renders the "inherit" fallback. */
  readonly providers?: ReadonlyArray<ServerProvider> | undefined;
}): string {
  return [
    PROTOCOL,
    "## Intent",
    intentBlock(input.intent, input.args),
    "## Live provider catalog",
    formatWorkflowAuthorCatalog(input.providers),
    ...(input.draftSource === undefined
      ? []
      : [
          "## Draft from the caller",
          "Start from this draft; validate it first and fix every finding before launching.",
          "```ts",
          clip(input.draftSource),
          "```",
        ]),
    WORKFLOW_AUTHOR_ESSENTIALS,
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
    "Fix the source and submit it with t3_orchestration_run({ source }) — the same run",
    "resumes from its checkpoint with your corrected source (already-executed steps replay from the",
    "journal, so do not change them). Validate first. If it cannot be fixed, do not submit; end",
    "your turn with one line that says why.",
    "## Current source",
    "```ts",
    clip(input.source),
    "```",
  ].join("\n\n");
}
