/**
 * Shared static-validation core for recipe workflows, used by both the path-based
 * (`t3team-recipeAgentValidate.ts`) and inline-source validation flows. `prepareWorkflow`/
 * `extractMeta` run just the file's head (imports blanked, only `Schema` injected) in a
 * `node:vm` context to read the `meta` literal, and `deriveWorkflowShape` is the same static
 * AST scan the UI's play-as-shape preview uses ({@link ./t3team-workflowShapePreview.ts}).
 * The workflow BODY is never executed.
 */
import * as Schema from "effect/Schema";

import {
  auditWorkflowSourceStatic,
  deriveWorkflowShape,
  extractMeta,
  formatFinding,
  normalizeCapabilities,
  prepareWorkflow,
  type RecipeToolIssue,
  type RecipeWorkflowMetaSummary,
  type ValidateRecipeToolResult,
  type WorkflowMeta,
} from "@t3team/sdk";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const issue = (
  path: string,
  phase: RecipeToolIssue["phase"],
  message: string,
): RecipeToolIssue => ({
  path,
  phase,
  message,
});

/** Field names of a `Schema.Struct(...)` literal from the extracted meta, when derivable. */
function schemaFieldNames(value: unknown): ReadonlyArray<string> | undefined {
  if (value === null || typeof value !== "object" || !("fields" in value)) {
    return undefined;
  }
  const fields = (value as { readonly fields: unknown }).fields;
  return fields !== null && typeof fields === "object" ? Object.keys(fields) : undefined;
}

function summarizeMeta(meta: WorkflowMeta): RecipeWorkflowMetaSummary {
  const inputFields = schemaFieldNames(meta.inputs);
  const outputFields = schemaFieldNames(meta.outputs);
  const capabilities = meta.capabilities?.map((capability) =>
    typeof capability === "string"
      ? capability
      : capability !== null && typeof capability === "object" && "id" in capability
        ? String((capability as { readonly id: unknown }).id)
        : String(capability),
  );
  return {
    name: meta.name,
    ...(typeof meta.description === "string" ? { description: meta.description } : {}),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(inputFields === undefined ? {} : { inputFields }),
    ...(outputFields === undefined ? {} : { outputFields }),
    ...(meta.phases === undefined
      ? {}
      : { phases: meta.phases.map((phase) => ({ title: phase.title })) }),
  };
}

/** Statically validate a workflow file's source text. Never executes the body. */
export function validateWorkflowSourceStatic(input: {
  readonly workflowPath: string;
  readonly sourceText: string;
}): ValidateRecipeToolResult {
  const { workflowPath, sourceText } = input;
  const source = { absolutePath: workflowPath, sourceText };
  const errors: RecipeToolIssue[] = [];
  let meta: RecipeWorkflowMetaSummary | undefined;
  let declared: ReadonlySet<string> | undefined;
  let prepared: ReturnType<typeof prepareWorkflow> | undefined;
  try {
    prepared = prepareWorkflow(source);
  } catch (error) {
    errors.push(issue(workflowPath, "load", errorMessage(error)));
  }
  if (prepared !== undefined) {
    try {
      const extracted = extractMeta(prepared, source, Schema);
      meta = summarizeMeta(extracted);
      declared = normalizeCapabilities(extracted);
    } catch (error) {
      errors.push(issue(workflowPath, "meta", errorMessage(error)));
    }
  }

  // Phase-25.5 load-time audits: determinism + static capability gating. Reported as validation
  // errors so an authoring agent sees them BEFORE a run instead of as a mid-flight
  // PermissionDeniedError. Capability rules are skipped when `meta` did not extract (the meta
  // error above is the real finding — a guessed empty capability set would bury it).
  try {
    for (const item of auditWorkflowSourceStatic(
      source,
      declared === undefined ? {} : { declared },
    )) {
      errors.push(issue(workflowPath, item.facet, formatFinding(item)));
    }
  } catch (error) {
    errors.push(issue(workflowPath, "load", `Static audit failed: ${errorMessage(error)}`));
  }

  let shape: ValidateRecipeToolResult["shape"];
  try {
    const derived = deriveWorkflowShape(source);
    shape = {
      name: derived.name,
      ...(derived.description === undefined ? {} : { description: derived.description }),
      phases: derived.phases,
      steps: derived.steps,
    };
  } catch (error) {
    errors.push(issue(workflowPath, "shape", errorMessage(error)));
  }

  return {
    ok: errors.length === 0,
    workflowPath,
    ...(meta === undefined ? {} : { meta }),
    ...(shape === undefined ? {} : { shape }),
    errors,
  } satisfies ValidateRecipeToolResult;
}

/** Validate inline workflow source (no on-disk path). Never executes the body. */
export const validateInlineWorkflowSourceForAgent = (source: string): ValidateRecipeToolResult =>
  validateWorkflowSourceStatic({ workflowPath: "<inline>", sourceText: source });
