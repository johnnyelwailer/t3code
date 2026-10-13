/**
 * `POST /api/t3team/project/workspace/linked-repositories/branches`: the branches a linked
 * repository's checkout knows about, for the branch picker. Read from the checkout itself (the
 * remote branches its last fetch brought in), so it needs no network and no GitHub credential, and a
 * repository that has not been cloned yet simply has none.
 *
 * @module t3team-project-repository-routesBranches
 */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { INSPECT_TIMEOUT_MS, linkedCheckoutGit as git } from "./t3team-linkedCheckoutGit.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  normalizeT3TeamWorkspaceRoot,
  REFERENCES_DIR_NAME,
  toT3TeamError,
} from "./t3team-project-repository-utils.ts";
import { findLinkedRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

export type LinkedRepositoryBranches = {
  readonly branches: ReadonlyArray<string>;
  /** The branch the checkout is on now. */
  readonly current?: string;
  /** The remote's default branch, when the clone recorded it. */
  readonly defaultBranch?: string;
};

const EMPTY: LinkedRepositoryBranches = { branches: [] };

const withoutRemote = (name: string): string => name.replace(/^origin\//, "");

export const listLinkedRepositoryBranches = Effect.fn("listLinkedRepositoryBranches")(function* (
  workspaceRoot: string,
  url: string,
) {
  const path = yield* Path.Path;
  const referencesRoot = path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  const manifest = yield* readPreservedReferenceManifest(
    path.join(referencesRoot, MANIFEST_FILE_NAME),
  );
  const entry = findLinkedRepository(manifest.linkedRepositories, url);
  if (!entry) return EMPTY;
  const cwd = entry.localPath;
  const refs = yield* git(
    "branches",
    cwd,
    ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"],
    INSPECT_TIMEOUT_MS,
  ).pipe(Effect.orElseSucceed(() => undefined));
  if (!refs || refs.exitCode !== 0) return EMPTY;
  const branches = refs.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "origin" && line !== "origin/HEAD")
    .map(withoutRemote)
    .toSorted((left, right) => left.localeCompare(right));
  const current = yield* git(
    "currentBranch",
    cwd,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    INSPECT_TIMEOUT_MS,
  ).pipe(Effect.orElseSucceed(() => undefined));
  const head = yield* git(
    "defaultBranch",
    cwd,
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    INSPECT_TIMEOUT_MS,
  ).pipe(Effect.orElseSucceed(() => undefined));
  const currentName = current?.exitCode === 0 ? current.stdout.trim() : "";
  const defaultName = head?.exitCode === 0 ? withoutRemote(head.stdout.trim()) : "";
  return {
    branches,
    ...(currentName && currentName !== "HEAD" ? { current: currentName } : {}),
    ...(defaultName ? { defaultBranch: defaultName } : {}),
  } satisfies LinkedRepositoryBranches;
});

export const t3teamLinkedRepositoryBranchesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/linked-repositories/branches",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string; readonly url?: string }>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const url = input.url?.trim() ?? "";
    if (workspaceRootInput.length === 0 || url.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot and url are required." });
    }
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    return okJson(yield* listLinkedRepositoryBranches(workspaceRoot, url));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to list linked repository branches.")),
    Effect.catch(errorResponse),
  ),
);
