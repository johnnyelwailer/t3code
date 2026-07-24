// @effect-diagnostics preferSchemaOverJson:off - the context metadata file is a plain JSON blob.
import {
  T3WORK_PROJECT_CONTEXT_ROOT,
  buildContextMetadataPath,
} from "@t3tools/project-context/t3workContextPaths";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { T3workFixtureProjectSource } from "./t3work-fixtureProjectSourceLoad.ts";
import { writeT3workWorkspaceContextFiles } from "./t3work-project-workspace-context-files.ts";

export type T3workFixtureSeedResult = {
  readonly accountId: string;
  readonly fixtureRoot: string;
  readonly projectId: string;
  readonly externalProjectId: string;
  readonly workItemCount: number;
  readonly refreshedKeys: ReadonlyArray<string>;
  readonly failedKeys: ReadonlyArray<string>;
};

/**
 * Bind the workspace to the fixture project. `loadT3workContextProjectRefreshScope` and
 * `loadT3workContextRefreshScope` both read the project identity out of this one file, so
 * writing it (with a `fixture:` accountId + externalProjectId) is the whole binding step —
 * there is no Atlassian account to connect and no "missing project binding" state left.
 */
export function writeT3workFixtureProjectContextMetadata(input: {
  readonly workspaceRoot: string;
  readonly source: T3workFixtureProjectSource;
}) {
  return Effect.gen(function* () {
    const now = DateTime.formatIso(yield* DateTime.now);
    const project = {
      ...input.source.project,
      workspace: { rootPath: input.workspaceRoot, createdAt: now },
      updatedAt: now,
    };
    return yield* writeT3workWorkspaceContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: [
        {
          relativePath: buildContextMetadataPath(T3WORK_PROJECT_CONTEXT_ROOT),
          contents: `${JSON.stringify({ project, linkedRepositoryUrls: [] }, null, 2)}\n`,
        },
        {
          relativePath: `${T3WORK_PROJECT_CONTEXT_ROOT}/linked-repositories.json`,
          contents: `${JSON.stringify({ linkedRepositoryUrls: [] }, null, 2)}\n`,
        },
      ],
    });
  });
}
