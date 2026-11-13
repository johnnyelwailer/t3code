import {
  isSameRepository,
  repositoryLookupCandidates,
} from "@t3tools/project-context/t3teamRepositoryIdentity";
import { sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { t3teamRandomHex } from "./t3team-random.ts";
import type * as Path from "effect/Path";

import {
  CHILD_WORKTREES_DIR_NAME,
  deriveReferenceDirectoryName,
  HIDDEN_T3TEAM_DIR,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";

export {
  isSameRepository,
  repositoryLookupCandidates,
} from "@t3tools/project-context/t3teamRepositoryIdentity";

export function findLinkedRepository(
  linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>,
  repoFullName: string,
): LinkedRepositoryBootstrapResult | undefined {
  const requestedCandidates = new Set(repositoryLookupCandidates(repoFullName));
  return linkedRepositories.find((linkedRepository) =>
    repositoryLookupCandidates(linkedRepository.url).some((candidate) =>
      requestedCandidates.has(candidate),
    ),
  );
}

export function buildChildBranchName(name: string): string {
  return `${sanitizeFeatureBranchName(name)}-${t3teamRandomHex(4).toLowerCase()}`;
}

function sanitizeScopedPathSegment(value: string): string {
  return sanitizeFeatureBranchName(value)
    .replace(/^feature\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildScopedChildWorktreePath(input: {
  readonly path: Path.Path;
  readonly projectWorkspaceRoot: string;
  readonly repoFullName: string;
  readonly repoRef: string;
  readonly worktreeKey: string;
}): string {
  const repoDirectory = deriveReferenceDirectoryName(input.repoFullName);
  const refDirectory = sanitizeScopedPathSegment(input.repoRef) || "default";
  const childDirectory = input.worktreeKey.slice(0, 8).toLowerCase();

  return input.path.join(
    input.projectWorkspaceRoot,
    HIDDEN_T3TEAM_DIR,
    CHILD_WORKTREES_DIR_NAME,
    repoDirectory,
    `${refDirectory}-${childDirectory}`,
  );
}

export function readLinkedRepositories(
  value: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<LinkedRepositoryBootstrapResult> {
  return (value ?? []).filter(
    (entry): entry is LinkedRepositoryBootstrapResult =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

/** True when `url` names the project's main repository (the workspace checkout, not a reference). */
export function isMainRepositoryUrl(
  mainRepository: { readonly url?: string } | undefined,
  url: string,
): boolean {
  return Boolean(mainRepository?.url && isSameRepository(mainRepository.url, url));
}

/** The branch recorded for `url` in a save payload, matching any spelling of the same repository. */
export function chosenBranchForRepository(
  branches: Readonly<Record<string, string>> | undefined,
  url: string,
): string | undefined {
  if (!branches) return undefined;
  if (url in branches) return branches[url];
  const match = Object.keys(branches).find((key) => isSameRepository(key, url));
  return match !== undefined ? branches[match] : undefined;
}
