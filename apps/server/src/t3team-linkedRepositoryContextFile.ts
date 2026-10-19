/**
 * Adds the checkout state of every linked repository to the project context file
 * `<state dir>/context/linked-repositories.json` as it is written (by the client's workspace sync
 * or the server's context refresh): its `repositories` list says, per linked URL, whether it is
 * cloned on this machine, where, and when it was last synced — read from the reference manifest
 * at write time. Linked repositories sync on demand, so `syncTool` names the tool an agent calls
 * to clone or fetch one. A file without `linkedRepositoryUrls` is written as it came.
 *
 * @module t3team-linkedRepositoryContextFile
 */
import { T3TEAM_PROJECT_CONTEXT_ROOT } from "@t3tools/project-context/t3teamContextPaths";
import { compactJson } from "@t3tools/project-context/t3teamDirectoryBundle";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  describeLinkedRepositoriesForAgent,
  LINKED_REPOSITORY_SYNC_MCP_TOOL,
} from "./t3team-linkedRepositoryAgentView.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";

export const LINKED_REPOSITORIES_CONTEXT_PATH = `${T3TEAM_PROJECT_CONTEXT_ROOT}/linked-repositories.json`;

const decodeContextFile = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

/** `files` with `linked-repositories.json` (when among them) carrying each repository's checkout
 * state. Expects state-dir-normalized paths. Encoded files are left untouched. */
export const withLinkedRepositoryCheckouts = Effect.fn("withLinkedRepositoryCheckouts")(function* <
  F extends {
    readonly relativePath: string;
    readonly contents: string;
    readonly encoding?: string;
  },
>(workspaceRoot: string, files: ReadonlyArray<F>) {
  const index = files.findIndex(
    (file) =>
      file.relativePath === LINKED_REPOSITORIES_CONTEXT_PATH &&
      (file.encoding === undefined || file.encoding === "utf8"),
  );
  const file = index === -1 ? undefined : files[index];
  if (file === undefined) return files;
  const decoded = Option.getOrUndefined(decodeContextFile(file.contents));
  const urls = decoded?.linkedRepositoryUrls;
  if (!decoded || !Array.isArray(urls)) return files;
  const path = yield* Path.Path;
  const manifest = yield* readPreservedReferenceManifest(
    path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME),
  );
  const contents = compactJson({
    ...decoded,
    repositories: describeLinkedRepositoriesForAgent({
      urls: urls.filter((url): url is string => typeof url === "string"),
      linkedRepositories: manifest.linkedRepositories,
      ...(manifest.mainRepository ? { mainRepository: manifest.mainRepository } : {}),
    }),
    syncTool: LINKED_REPOSITORY_SYNC_MCP_TOOL,
  });
  return files.map((candidate, at) => (at === index ? { ...candidate, contents } : candidate));
});
