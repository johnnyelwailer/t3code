/**
 * `t3team.recipe.validate` implementation: the authoring feedback loop for recipe workflows.
 * Static only — the workflow BODY is never executed. `prepareWorkflow`/`extractMeta` run just the
 * file's head (imports blanked, only `Schema` injected) in a `node:vm` context to read the `meta`
 * literal, and `deriveWorkflowShape` is the same static AST scan the UI's play-as-shape preview
 * uses ({@link ./t3team-workflowShapePreview.ts}). The one dynamic import is a recipe DIRECTORY's
 * `recipe.ts` (to resolve its `defaultAction` workflow) — the same trusted-project-code path UI
 * discovery already takes. Paths are constrained to the project workspace root.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  deriveWorkflowShape,
  extractMeta,
  prepareWorkflow,
  type RecipeToolIssue,
  type RecipeWorkflowMetaSummary,
  type ValidateRecipeToolResult,
  type WorkflowMeta,
} from "@t3team/sdk";

import {
  importRecipeModuleRef,
  resolveRecipeWorkflowPath,
} from "./t3team-projectRecipeDiscoveryModule.ts";
import {
  decodeRawProjectRecipeManifest,
  normalizeRecipeManifest,
  resolveWithinRoot,
  type RawProjectRecipeManifest,
} from "./t3team-projectRecipeDiscoveryShared.ts";

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

const failedResult = (problems: ReadonlyArray<RecipeToolIssue>): ValidateRecipeToolResult => ({
  ok: false,
  errors: problems,
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

/** Resolve a recipe DIRECTORY to its workflow file (typed `recipe.ts` first, then `recipe.json`). */
const resolveDirectoryWorkflowPath = Effect.fn("resolveDirectoryWorkflowPath")(function* (
  recipePath: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const modulePath = pathService.join(recipePath, "recipe.ts");
  if (yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false))) {
    const ref = yield* importRecipeModuleRef(modulePath).pipe(
      Effect.mapError((error) => issue(modulePath, "load", errorMessage(error))),
    );
    return yield* Effect.try({
      try: () => resolveRecipeWorkflowPath(pathService, recipePath, ref),
      catch: (error) => issue(modulePath, "discover", errorMessage(error)),
    });
  }
  const manifestPath = pathService.join(recipePath, "recipe.json");
  if (!(yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false)))) {
    return yield* Effect.fail(
      issue(recipePath, "discover", "Recipe directory has neither recipe.ts nor recipe.json."),
    );
  }
  const manifest = yield* fileSystem.readFileString(manifestPath).pipe(
    Effect.flatMap(decodeRawProjectRecipeManifest),
    Effect.flatMap((raw) =>
      Effect.try({
        try: () => normalizeRecipeManifest(raw as RawProjectRecipeManifest),
        catch: (error) => errorMessage(error),
      }),
    ),
    Effect.mapError((error) => issue(manifestPath, "load", errorMessage(error))),
  );
  if (typeof manifest.workflow !== "string" || manifest.workflow.trim().length === 0) {
    return yield* Effect.fail(
      issue(manifestPath, "discover", "recipe.json declares no 'workflow' entry to validate."),
    );
  }
  const workflow = manifest.workflow;
  return yield* Effect.try({
    try: () => resolveWithinRoot(pathService, recipePath, workflow),
    catch: (error) => issue(manifestPath, "discover", errorMessage(error)),
  });
});

/** Statically validate a `.workflow.ts` (or a recipe directory's workflow). Never runs the body. */
export const validateProjectRecipeWorkflowForAgent = Effect.fn(
  "validateProjectRecipeWorkflowForAgent",
)(function* (input: { readonly workspaceRoot: string; readonly path: string }) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const workspaceRoot = pathService.resolve(input.workspaceRoot);

  let requestedPath: string;
  try {
    requestedPath = resolveWithinRoot(pathService, workspaceRoot, input.path);
  } catch (error) {
    return failedResult([
      issue(
        input.path,
        "discover",
        `${errorMessage(error)} Paths must stay inside the project workspace root.`,
      ),
    ]);
  }

  const stat = yield* fileSystem.stat(requestedPath).pipe(Effect.catch(() => Effect.succeed(null)));
  if (!stat) {
    return failedResult([issue(requestedPath, "discover", "Path does not exist.")]);
  }
  const resolved =
    stat.type === "Directory"
      ? yield* resolveDirectoryWorkflowPath(requestedPath).pipe(Effect.result)
      : ({ _tag: "Success", success: requestedPath } as const);
  if (resolved._tag === "Failure") {
    return failedResult([resolved.failure]);
  }
  const workflowPath = resolved.success;

  const sourceText = yield* fileSystem
    .readFileString(workflowPath)
    .pipe(Effect.result)
    .pipe(
      Effect.map((read) =>
        read._tag === "Failure" ? { error: errorMessage(read.failure) } : { text: read.success },
      ),
    );
  if ("error" in sourceText) {
    return failedResult([
      issue(workflowPath, "discover", `Workflow file could not be read: ${sourceText.error}`),
    ]);
  }

  const source = { absolutePath: workflowPath, sourceText: sourceText.text };
  const errors: RecipeToolIssue[] = [];
  let meta: RecipeWorkflowMetaSummary | undefined;
  let prepared: ReturnType<typeof prepareWorkflow> | undefined;
  try {
    prepared = prepareWorkflow(source);
  } catch (error) {
    errors.push(issue(workflowPath, "load", errorMessage(error)));
  }
  if (prepared !== undefined) {
    try {
      meta = summarizeMeta(extractMeta(prepared, source, Schema));
    } catch (error) {
      errors.push(issue(workflowPath, "meta", errorMessage(error)));
    }
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
});
