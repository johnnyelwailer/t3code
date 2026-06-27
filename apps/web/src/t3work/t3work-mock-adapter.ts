/* oxlint-disable eslint/no-control-regex -- Existing merged lint debt; keep green while preserving behavior. */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { ProjectShellProject, ProjectShellProjectId } from "@t3tools/project-context";
import { randomUUID } from "~/lib/utils";

export type CreateProjectInput = {
  readonly title: string;
  readonly sourceProvider: string;
  readonly accountId?: string;
  readonly externalProjectId?: string;
  readonly externalProjectKey?: string;
  readonly externalProjectUrl?: string;
  readonly raw?: unknown;
};

function normalizeWorkspaceDirectoryName(title: string): string {
  const normalized = title
    .trim()
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 80) : "Project";
}

const makeWorkspacePath = (title: string): string => {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined>; platform?: string };
  };
  const home = maybeProcess.process?.env?.HOME ?? maybeProcess.process?.env?.USERPROFILE ?? "~";
  const platform: string = maybeProcess.process?.platform ?? "browser";
  const base =
    platform === "darwin"
      ? `${home}/Library/Application Support/T3 Code/t3work/projects`
      : platform === "win32"
        ? `${home}/AppData/Roaming/T3 Code/t3work/projects`
        : platform === "browser"
          ? `${home}/.t3code/t3work/projects`
          : `${home}/.config/T3 Code/t3work/projects`;
  return `${base}/${normalizeWorkspaceDirectoryName(title)}`;
};

export const t3workCreateProject = (input: CreateProjectInput) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const id = randomUUID() as ProjectShellProjectId;
    const workspace = {
      rootPath: makeWorkspacePath(input.title),
      createdAt: DateTime.formatIso(now),
    };

    return {
      id,
      title: input.title,
      source: {
        provider: input.sourceProvider as "atlassian" | "linear" | "github" | "local" | "managed",
        accountId: input.accountId,
        externalProjectId: input.externalProjectId,
        externalProjectKey: input.externalProjectKey,
        externalProjectUrl: input.externalProjectUrl,
        raw: input.raw,
      },
      workspace,
      createdAt: DateTime.formatIso(now),
      updatedAt: DateTime.formatIso(now),
    } satisfies ProjectShellProject;
  });
