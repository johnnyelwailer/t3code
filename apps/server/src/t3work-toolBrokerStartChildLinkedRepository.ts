import { sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { t3workRandomHex } from "./t3work-random.ts";
import type * as Path from "effect/Path";

import {
  deriveReferenceDirectoryName,
  HIDDEN_T3WORK_DIR,
  type LinkedRepositoryBootstrapResult,
} from "./t3work-project-repository-utils.ts";

export function normalizeRepositoryLookupKey(value: string): string {
  const trimmed = value.trim().replace(/\.git$/i, "");
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2] ?? ""}`.replace(/^\/+/, "").toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname}`
      .replace(/\.git$/i, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/")
      .toLowerCase();
  } catch {
    return trimmed.replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase();
  }
}

export function repositoryLookupCandidates(value: string): ReadonlyArray<string> {
  const normalized = normalizeRepositoryLookupKey(value);
  const candidates = new Set<string>([normalized]);
  const firstSlashIndex = normalized.indexOf("/");
  if (firstSlashIndex > 0 && firstSlashIndex < normalized.length - 1) {
    candidates.add(normalized.slice(firstSlashIndex + 1));
  }
  return [...candidates];
}

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
  return `${sanitizeFeatureBranchName(name)}-${t3workRandomHex(4).toLowerCase()}`;
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
  readonly childThreadId: string;
}): string {
  const repoDirectory = deriveReferenceDirectoryName(input.repoFullName);
  const refDirectory = sanitizeScopedPathSegment(input.repoRef) || "default";
  const childDirectory = input.childThreadId.slice(0, 8).toLowerCase();

  return input.path.join(
    input.projectWorkspaceRoot,
    HIDDEN_T3WORK_DIR,
    "child-session-worktrees",
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
