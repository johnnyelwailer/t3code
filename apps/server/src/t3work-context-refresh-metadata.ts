import type { ProjectShellProject } from "@t3tools/project-context";
import { buildContextMetadataPath } from "@t3tools/project-context/t3workContextPaths";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { parseT3workContextJsonObject } from "./t3work-context-json.ts";

export function loadT3workContextProjectMetadata(input: {
  readonly workspaceRoot: string;
  readonly requestedProjectId: string;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;

    const metadataPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: buildContextMetadataPath(".t3work/context"),
    });
    const metadata = parseT3workContextJsonObject(
      yield* fileSystem
        .readFileString(metadataPath.absolutePath)
        .pipe(Effect.orElseSucceed(() => "")),
    );
    const project = metadata?.project as ProjectShellProject | undefined;
    if (!project?.source?.accountId || !project.source.externalProjectId) {
      return yield* Effect.fail("Current project Atlassian source is unavailable.");
    }

    const requestedProjectId = input.requestedProjectId.trim();
    if (requestedProjectId.length > 0 && project.id !== requestedProjectId) {
      return yield* Effect.fail(
        `project_id '${requestedProjectId}' does not match workspace project '${project.id}'.`,
      );
    }

    return project;
  });
}
