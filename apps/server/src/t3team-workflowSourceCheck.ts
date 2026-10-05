/**
 * The FULL static check of an orchestration source — the author agent's `validate`, and the gate
 * every launch passes through, so the two can never disagree.
 *
 * Before this module the launch path ran four format gates ({@link precheckWorkflowSource}) while
 * the real audit (`auditWorkflowSourceStatic`: determinism, runtime bindings, capabilities, the
 * TypeScript checker) ran only in `t3team.recipe.validate`. An orchestration could therefore be
 * accepted and die at its first call. Here the gates are composed, in the order the real load path
 * would fail:
 *   1. format precheck (meta present, loader parse, V8 compile, usable meta);
 *   2. the SDK static audit with the type checker — includes the `bindings` facet, which rejects
 *      any `@t3team/sdk` import the engine does not bind (the ReferenceError incident);
 *   3. every `model: "<literal>"` against the LIVE provider catalog, through the same resolver the
 *      engine uses at spawn time ({@link ./t3team-workflowModelSlugScan.ts}).
 * Every finding is a typed message that names the fix. The body is never executed.
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import type { RecipeToolIssue, ValidateRecipeToolResult } from "@t3team/sdk";

import { validateWorkflowSourceStatic } from "./t3team-recipeAgentValidateStatic.ts";
import { scanWorkflowModelSlugs } from "./t3team-workflowModelSlugScan.ts";
import { precheckWorkflowSource } from "./t3team-workflowSourcePrecheck.ts";

export interface WorkflowSourceFinding {
  /** Which gate produced it: `format`, the audit facets, `shape`, or `model`. */
  readonly phase: RecipeToolIssue["phase"];
  readonly message: string;
}

export type WorkflowSourceCheckResult =
  | { readonly ok: true; readonly audited: ValidateRecipeToolResult }
  | {
      readonly ok: false;
      readonly findings: ReadonlyArray<WorkflowSourceFinding>;
      readonly audited: ValidateRecipeToolResult | undefined;
    };

export interface WorkflowSourceCheckInput {
  readonly source: string;
  /** Path the findings cite; defaults to a synthetic inline path. */
  readonly absolutePath?: string | undefined;
  /** Live provider snapshots. Absent (no registry wired) skips the model gate — the engine's own
   * resolver stays the backstop, exactly as before this module existed. */
  readonly providers?: ReadonlyArray<ServerProvider> | undefined;
  /** The run's own selection: the instance a bare `model: "<slug>"` resolves against. Absent
   * (no thread context) also skips the model gate. */
  readonly baseModelSelection?: ModelSelection | undefined;
}

const SYNTHETIC_PATH = "/check/workflow.ts";

export function checkWorkflowSource(input: WorkflowSourceCheckInput): WorkflowSourceCheckResult {
  const absolutePath = input.absolutePath ?? SYNTHETIC_PATH;
  const findings: WorkflowSourceFinding[] = [];

  const format = precheckWorkflowSource(input.source);
  if (format !== null) {
    // A source that does not parse yields nothing but noise from the later gates.
    return { ok: false, findings: [{ phase: "format", message: format }], audited: undefined };
  }

  const audited = validateWorkflowSourceStatic({
    workflowPath: absolutePath,
    sourceText: input.source,
  });
  for (const issue of audited.errors) findings.push({ phase: issue.phase, message: issue.message });

  if (input.providers !== undefined && input.baseModelSelection !== undefined) {
    for (const item of scanWorkflowModelSlugs({
      sourceText: input.source,
      absolutePath,
      providers: input.providers,
      baseModelSelection: input.baseModelSelection,
    })) {
      findings.push({ phase: "model", message: `${item.line}:${item.column}: ${item.message}` });
    }
  }

  return findings.length === 0 ? { ok: true, audited } : { ok: false, findings, audited };
}

/** The same check, shaped as the `t3team.recipe.validate` result an authoring agent iterates on.
 * Without a base selection the model gate is skipped (there is no instance to resolve against). */
export function checkWorkflowSourceForValidate(input: {
  readonly source: string;
  readonly providers?: ReadonlyArray<ServerProvider> | undefined;
  readonly baseModelSelection?: ModelSelection | undefined;
}): ValidateRecipeToolResult {
  const workflowPath = "<inline>";
  const result = checkWorkflowSource({ ...input, absolutePath: workflowPath });
  if (result.ok) return result.audited;
  return {
    ok: false,
    workflowPath,
    ...(result.audited?.meta === undefined ? {} : { meta: result.audited.meta }),
    ...(result.audited?.shape === undefined ? {} : { shape: result.audited.shape }),
    errors: result.findings.map((item) => ({
      path: workflowPath,
      phase: item.phase,
      message: item.message,
    })),
  };
}

/** One line per finding, numbered, so a tool result reads as a fix list. */
export function formatWorkflowSourceFindings(
  findings: ReadonlyArray<WorkflowSourceFinding>,
): string {
  return findings.map((item, index) => `${index + 1}. [${item.phase}] ${item.message}`).join("\n");
}
