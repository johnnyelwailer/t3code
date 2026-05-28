import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import {
  buildT3workActionRecipeContextMap,
  createEmptyT3workActionRecipeContext,
  resolveT3workActionRecipeContextSchema,
  type T3workActionRecipeContext,
} from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType } from "@t3tools/project-recipes";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import { workflowRunRecipeRootPath } from "./t3work-recipeWorkflowRunPaths.ts";

type AtomicWriteRequirements =
  ReturnType<typeof writeFileStringAtomically> extends Effect.Effect<unknown, unknown, infer R>
    ? R
    : never;

function encodeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function toJsonSchemaObject(schema: Schema.Top): unknown {
  const document = Schema.toJsonSchemaDocument(schema);
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    return { ...document.schema, $defs: document.definitions };
  }
  return document.schema;
}

const copyDirectoryContents = (input: {
  sourceRoot: string;
  targetRoot: string;
}): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const entryNames = yield* fileSystem
      .readDirectory(input.sourceRoot, { recursive: false })
      .pipe(Effect.orElseSucceed(() => [] as Array<string>));

    for (const entryName of entryNames) {
      const sourcePath = pathService.join(input.sourceRoot, entryName);
      const targetPath = pathService.join(input.targetRoot, entryName);
      const stats = yield* fileSystem.stat(sourcePath).pipe(Effect.orElseSucceed(() => null));
      if (!stats) {
        continue;
      }
      if (stats.type === "Directory") {
        yield* fileSystem.makeDirectory(targetPath, { recursive: true });
        yield* copyDirectoryContents({
          sourceRoot: sourcePath,
          targetRoot: targetPath,
        });
        continue;
      }
      if (stats.type === "File") {
        const contents = yield* fileSystem.readFile(sourcePath);
        yield* fileSystem
          .makeDirectory(pathService.dirname(targetPath), { recursive: true })
          .pipe(Effect.andThen(fileSystem.writeFile(targetPath, contents)));
      }
    }
  });

export const materializeRecipeWorkflowRun = (input: {
  workspaceRoot: string;
  workflowRunId: string;
  launch: ProjectRecipeWorkflowLaunchType;
  promptText: string;
  launchContext?: T3workActionRecipeContext;
  copyRecipeFiles?: boolean;
}): Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path | AtomicWriteRequirements
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const runRootPath = workflowRunRecipeRootPath(
      pathService,
      input.workspaceRoot,
      input.workflowRunId,
    );
    const launchContext =
      input.launchContext ?? createEmptyT3workActionRecipeContext(input.launch.surface);

    yield* fileSystem.makeDirectory(runRootPath, { recursive: true });
    yield* writeFileStringAtomically({
      filePath: pathService.join(runRootPath, "recipe.json"),
      contents: encodeJson(input.launch),
    });
    yield* writeFileStringAtomically({
      filePath: pathService.join(runRootPath, "context.json"),
      contents: encodeJson(launchContext),
    });
    yield* writeFileStringAtomically({
      filePath: pathService.join(runRootPath, "context.schema.json"),
      contents: encodeJson(
        toJsonSchemaObject(resolveT3workActionRecipeContextSchema(launchContext.surface)),
      ),
    });
    yield* writeFileStringAtomically({
      filePath: pathService.join(runRootPath, "context-map.md"),
      contents: buildT3workActionRecipeContextMap(launchContext.surface),
    });
    yield* writeFileStringAtomically({
      filePath: pathService.join(runRootPath, "prompt.md"),
      contents: ensureTrailingNewline(input.promptText),
    });

    if (input.copyRecipeFiles && input.launch.recipePath) {
      const sourceFilesRoot = pathService.join(input.launch.recipePath, "files");
      const hasRecipeFiles = yield* fileSystem
        .exists(sourceFilesRoot)
        .pipe(Effect.orElseSucceed(() => false));
      if (hasRecipeFiles) {
        yield* copyDirectoryContents({
          sourceRoot: sourceFilesRoot,
          targetRoot: pathService.join(runRootPath, "files"),
        });
      }
    }

    return runRootPath;
  });
