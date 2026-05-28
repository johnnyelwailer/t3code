import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import { ProjectRecipeWorkflowDocument } from "@t3tools/project-recipes";

import { normalizeWorkflowCandidate } from "./t3work-recipeWorkflowRuntimeNormalization.ts";
import { resolveWithinRoot } from "./t3work-recipeWorkflowRuntimeShared.ts";

const decodeProjectRecipeWorkflowDocument = Schema.decodeUnknownEffect(
  ProjectRecipeWorkflowDocument,
);

export const readWorkflowModule = Effect.fn("readWorkflowModule")(function* (input: {
  workflowPath: string;
  workspaceRoot: string;
  recipePath?: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const runtimeContext = yield* Effect.context<FileSystem.FileSystem>();
  const runPromise = Effect.runPromiseWith(runtimeContext);
  const workflowUrl = pathToFileURL(input.workflowPath);
  workflowUrl.searchParams.set("v", String(yield* Clock.currentTimeMillis));
  const imported = (yield* Effect.tryPromise(() => import(workflowUrl.toString()))) as Record<
    string,
    unknown
  >;

  const workflowApi = {
    workspace: {
      rootPath: input.workspaceRoot,
      ...(input.recipePath ? { recipePath: input.recipePath } : {}),
      readText: async (relativePath: string) =>
        runPromise(
          fileSystem.readFileString(
            resolveWithinRoot(
              pathService,
              input.recipePath ?? pathService.dirname(input.workflowPath),
              relativePath,
            ),
          ),
        ),
      writeText: async (relativePath: string, content: string) => {
        const targetPath = resolveWithinRoot(
          pathService,
          input.recipePath ?? pathService.dirname(input.workflowPath),
          relativePath,
        );
        await runPromise(
          fileSystem
            .makeDirectory(pathService.dirname(targetPath), { recursive: true })
            .pipe(Effect.andThen(fileSystem.writeFileString(targetPath, content))),
        );
      },
      exists: async (relativePath: string) =>
        runPromise(
          fileSystem
            .exists(
              resolveWithinRoot(
                pathService,
                input.recipePath ?? pathService.dirname(input.workflowPath),
                relativePath,
              ),
            )
            .pipe(Effect.orElseSucceed(() => false)),
        ),
    },
    fetch,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  };

  const candidate = Array.isArray(imported.steps)
    ? { steps: imported.steps }
    : Array.isArray(imported.default)
      ? { steps: imported.default }
      : imported.default &&
          typeof imported.default === "object" &&
          Array.isArray((imported.default as { steps?: unknown }).steps)
        ? imported.default
        : typeof imported.workflow === "function"
          ? yield* Effect.promise(() =>
              Promise.resolve((imported.workflow as Function)({}, workflowApi)),
            )
          : typeof imported.default === "function"
            ? yield* Effect.promise(() =>
                Promise.resolve((imported.default as Function)({}, workflowApi)),
              )
            : imported.workflow && typeof imported.workflow === "object"
              ? imported.workflow
              : null;

  if (!candidate) {
    throw new Error(
      "workflow.ts must export steps, a workflow object, or a default/workflow function.",
    );
  }

  return yield* decodeProjectRecipeWorkflowDocument(normalizeWorkflowCandidate(candidate));
});
