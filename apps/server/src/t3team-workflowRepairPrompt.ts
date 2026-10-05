/**
 * Prompt construction for the no-tools structured repair surface — the context-free fallback used
 * when a run's author conversation is gone (server restart). The repair model gets no
 * shell/file/browser access, so everything it needs — including the authoring contract, which is
 * the SAME generated reference the author reads — must ride in the prompt.
 */

import { WORKFLOW_AUTHOR_REFERENCE } from "@t3team/sdk";

/** Keep pathological sources from blowing the repair model's context budget. */
const MAX_EMBEDDED_SOURCE_CHARS = 16_000;

export function buildWorkflowRepairPrompt(input: {
  readonly intent: {
    readonly goal: string;
    readonly expectedOutcome: string;
    readonly guardrails: ReadonlyArray<string>;
  };
  readonly failure: string;
  readonly priorReasons: ReadonlyArray<string>;
  readonly args: unknown;
  readonly workspaceRoot: string;
  readonly source: string;
}): string {
  const source =
    input.source.length > MAX_EMBEDDED_SOURCE_CHARS
      ? `${input.source.slice(0, MAX_EMBEDDED_SOURCE_CHARS)}\n// … source truncated for repair (${input.source.length} chars total)`
      : input.source;
  return [
    "Repair this t3team workflow.",
    'Return exact JSON only: {"safeToResume":true,"correctedWorkflow":"...","summary":"..."} or {"safeToResume":false,"cancelReason":"..."}.',
    `The corrected workflow MUST be valid workflow TypeScript per this reference (never YAML or JSON):\n${WORKFLOW_AUTHOR_REFERENCE}`,
    `Intent goal: ${input.intent.goal}`,
    `Expected outcome: ${input.intent.expectedOutcome}`,
    `Guardrails (must not widen): ${input.intent.guardrails.join(" | ")}`,
    `Failure: ${input.failure}`,
    ...(input.priorReasons.length === 0
      ? []
      : [`Prior repair failures: ${input.priorReasons.join(" | ")}`]),
    `Args: ${JSON.stringify(input.args)}`,
    `Workspace root: ${input.workspaceRoot}`,
    `Source:\n${source}`,
  ].join("\n\n");
}
