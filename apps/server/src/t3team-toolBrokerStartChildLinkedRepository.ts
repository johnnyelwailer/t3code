import { repositoryLookupCandidates } from "@t3tools/project-context/t3teamRepositoryIdentity";
import { sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { t3teamRandomHex } from "./t3team-random.ts";
import type * as Path from "effect/Path";

import {
  deriveReferenceDirectoryName,
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

/** A child's worktree lives in the server's worktrees directory, laid out like upstream's
 * `<repository>/<branch>` worktrees: the host writes nothing into a user's checkout. */
export function buildScopedChildWorktreePath(input: {
  readonly path: Path.Path;
  readonly worktreesRoot: string;
  readonly repoFullName: string;
  readonly repoRef: string;
  readonly worktreeKey: string;
}): string {
  const repoDirectory = deriveReferenceDirectoryName(input.repoFullName);
  const refDirectory = sanitizeScopedPathSegment(input.repoRef) || "default";
  const childDirectory = input.worktreeKey.slice(0, 8).toLowerCase();

  return input.path.join(input.worktreesRoot, repoDirectory, `${refDirectory}-${childDirectory}`);
}

export function readLinkedRepositories(
  value: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<LinkedRepositoryBootstrapResult> {
  return (value ?? []).filter(
    (entry): entry is LinkedRepositoryBootstrapResult =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}
