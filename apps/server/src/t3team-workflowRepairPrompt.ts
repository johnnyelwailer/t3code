/**
 * Prompt construction for the no-tools structured repair surface. The repair
 * model gets no shell/file/browser access, so everything it needs — including
 * the authoring format contract — must ride in the prompt: the most common
 * authoring failure is wrong format entirely (YAML/JSON instead of the
 * workflow TypeScript), which is unfixable blind.
 */

import { T3TEAM_WORKFLOW_MANUAL } from "./t3team-workflowManual.ts";

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
    `The corrected workflow MUST be valid workflow TypeScript per this contract (never YAML or JSON):\n${T3TEAM_WORKFLOW_MANUAL}`,
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

/**
 * Prompt variant for an INPUT-CONTRACT failure (see `WorkflowInputDecodeError` /
 * `workflowRepairTargetFor` in `t3team-workflowRepairGuardrails.ts`): the workflow SOURCE is
 * correct, the CALLER's launch args are not. Asks for corrected args only — the source is
 * included read-only, for its declared `meta.inputs` schema, never as something to rewrite.
 */
export function buildWorkflowArgsRepairPrompt(input: {
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
    "This t3team workflow's SOURCE is correct. The CALLER passed the wrong launch arguments — " +
      "do NOT rewrite the workflow body, only propose corrected arguments.",
    'Return exact JSON only: {"safeToResume":true,"correctedArgs":<value matching the workflow\'s ' +
      'declared meta.inputs schema below>,"summary":"..."} or ' +
      '{"safeToResume":false,"cancelReason":"..."}.',
    `Intent goal: ${input.intent.goal}`,
    `Expected outcome: ${input.intent.expectedOutcome}`,
    `Guardrails (must not widen): ${input.intent.guardrails.join(" | ")}`,
    `Failure (names the exact invalid/missing argument): ${input.failure}`,
    ...(input.priorReasons.length === 0
      ? []
      : [`Prior repair failures: ${input.priorReasons.join(" | ")}`]),
    `Args the workflow was actually launched with: ${JSON.stringify(input.args)}`,
    `Workspace root: ${input.workspaceRoot}`,
    `Workflow source, read-only — do not rewrite it, only read its declared \`meta.inputs\` ` +
      `schema:\n${source}`,
  ].join("\n\n");
}
