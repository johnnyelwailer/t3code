import * as NodeOS from "node:os";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import type {
  ProjectMainRepositoryCandidate,
  ProjectMainRepositorySelection,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { ensureNexiProjectStateDir } from "./t3team-projectMainRepositoryState.ts";

export type BootstrapWorkspaceRequest = {
  readonly workspaceRoot: string;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
  readonly setupProfileId?: string;
  readonly customProfile?: import("@t3tools/t3team-skill-packs").T3TeamProfile;
};

export type LinkedRepositoryBootstrapResult = {
  readonly url: string;
  readonly localPath: string;
  readonly status: "cloned" | "updated" | "failed";
  readonly error?: string;
};

/** The workspace root is itself a git repository — the project's main repository: sub-work
 * happens in worktrees of this repository, not in reference clones. `adopted` when the workspace
 * already was a repository; `detected`/`user` when a linked clone became the workspace (see
 * `ProjectMainRepositorySelection`). `url` is the origin remote when one is configured. */
export type MainRepositoryBootstrapResult = {
  readonly url?: string;
  readonly localPath: string;
  readonly status: ProjectMainRepositorySelection;
};

export type BootstrapWorkspaceResponse = {
  readonly workspaceRoot: string;
  readonly workspaceRepositoryInitialized: boolean;
  readonly referencesRoot: string;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly mainRepository?: MainRepositoryBootstrapResult;
  /** Linked clones that already carry a project state dir (flag `NEXI_FF_MAIN_REPOSITORY`; only
   * when the workspace has no main repository yet). */
  readonly mainRepositoryCandidates?: ReadonlyArray<ProjectMainRepositoryCandidate>;
};

export type ContextWorkspaceFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
};

export type WriteContextFilesRequest = {
  readonly workspaceRoot: string;
  readonly files: ReadonlyArray<ContextWorkspaceFile>;
};

export type WriteContextFilesResponse = {
  readonly workspaceRoot: string;
  readonly writtenFiles: ReadonlyArray<string>;
};

/** The project state dir name — owned by the single resolver in `@t3tools/project-context`. */
export const HIDDEN_T3TEAM_DIR = PROJECT_STATE_DIR;
export const REFERENCES_DIR_NAME = "references";
export const MANIFEST_FILE_NAME = "reference-repositories.json";
export const CHILD_WORKTREES_DIR_NAME = "child-session-worktrees";
export const GITIGNORE_ENTRY = `${HIDDEN_T3TEAM_DIR}/`;
/** Gitignore entries for a MAIN repository (the workspace root is a real git repository):
 * only the machine-local subpaths stay ignored so committed team state (skills, recipes,
 * conventions) can live in the state dir and be shared through the repository (GHE #42). */
export const MAIN_REPOSITORY_GITIGNORE_ENTRIES = [
  `${HIDDEN_T3TEAM_DIR}/${REFERENCES_DIR_NAME}/`,
  `${HIDDEN_T3TEAM_DIR}/${CHILD_WORKTREES_DIR_NAME}/`,
] as const;

export type ReferenceManifestFile = {
  readonly workspaceRoot: string;
  readonly referencesRoot: string;
  readonly workspaceRepositoryInitialized: boolean;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly mainRepository?: MainRepositoryBootstrapResult;
  readonly updatedAt: string;
};

export function normalizeRepositoryUrls(
  urls: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  const deduped = new Set<string>();
  for (const candidate of urls ?? []) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) deduped.add(trimmed);
  }
  return [...deduped.values()];
}

export const normalizeT3TeamWorkspaceRoot = Effect.fn("normalizeT3TeamWorkspaceRoot")(function* (
  workspaceRoot: string,
) {
  const path = yield* Path.Path;
  const trimmed = workspaceRoot.trim();
  const root =
    trimmed === "~"
      ? NodeOS.homedir()
      : trimmed.startsWith("~/") || trimmed.startsWith("~\\")
        ? path.join(NodeOS.homedir(), trimmed.slice(2))
        : path.resolve(trimmed);
  yield* ensureNexiProjectStateDir(root);
  return root;
});

function sanitizeSlugSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveReferenceDirectoryName(url: string): string {
  const trimmed = url.trim();
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) {
    const host = sanitizeSlugSegment(sshMatch[1] ?? "host");
    const pathPart = sanitizeSlugSegment((sshMatch[2] ?? "repo").replace(/\.git$/i, ""));
    return `${host}-${pathPart}`;
  }

  const shorthandMatch = /^([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i.exec(trimmed);
  if (shorthandMatch) {
    const owner = sanitizeSlugSegment(shorthandMatch[1] ?? "owner");
    const repo = sanitizeSlugSegment((shorthandMatch[2] ?? "repo").replace(/\.git$/i, ""));
    return `${owner}-${repo}`;
  }

  try {
    const parsed = new URL(trimmed);
    const host = sanitizeSlugSegment(parsed.host);
    const pathname = sanitizeSlugSegment(
      parsed.pathname.replace(/^\/+/, "").replace(/\.git$/i, ""),
    );
    return `${host}-${pathname}`;
  } catch {
    const fallback = sanitizeSlugSegment(trimmed.replace(/\.git$/i, ""));
    return fallback || "repo";
  }
}

export function formatReferenceManifestJson(manifest: ReferenceManifestFile): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function toT3TeamError(cause: unknown, fallback: string): T3TeamAtlassianError {
  return cause instanceof T3TeamAtlassianError
    ? cause
    : new T3TeamAtlassianError({
        message: cause instanceof Error ? cause.message : fallback,
        cause,
      });
}
