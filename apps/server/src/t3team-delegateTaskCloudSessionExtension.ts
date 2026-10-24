/**
 * The delegate_task `cloudSession` extension's input side: the option it advertises, parsing,
 * and which repository the child works on. Placement is `t3team-delegateTaskCloudSession.ts`.
 */
import type { RepositoryIdentity } from "@t3tools/contracts";

import type { DelegatedTaskExtensionOption } from "./mcp/t3team-delegatedTaskPreparation.ts";
import type { ParseResult } from "./t3team-delegateTaskExtensions.ts";

export const CLOUD_SESSION_EXTENSION: DelegatedTaskExtensionOption = {
  key: "cloudSession",
  description:
    "'auto' | 'new' | <cloud session id>: names the cloud session for the repository the child works on. 'auto' names a ready or starting session for it, 'new' and an 'auto' miss report that a new one is needed (none is started yet). The child still runs on THIS server and no environment binding is recorded.",
};

/** The extension is offered only when the placement exists (flag on). */
export const withCloudSessionExtension = (
  base: ReadonlyArray<DelegatedTaskExtensionOption>,
  placementAvailable: boolean,
): ReadonlyArray<DelegatedTaskExtensionOption> =>
  placementAvailable ? [...base, CLOUD_SESSION_EXTENSION] : base;

export type CloudSessionRequest =
  | { readonly kind: "auto" }
  | { readonly kind: "new" }
  | { readonly kind: "session"; readonly sessionId: string };

export function parseCloudSessionExtension(
  value: unknown,
): ParseResult<CloudSessionRequest | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") {
    return {
      ok: false,
      message:
        "extensions.cloudSession must be 'auto', 'new' or a cloud session id. Omit it to leave cloud sessions alone.",
    };
  }
  if (text === "auto" || text === "new") return { ok: true, value: { kind: text } };
  return { ok: true, value: { kind: "session", sessionId: text } };
}

/**
 * The repository the child works on: the delegated worktree's repository when it names one, else
 * the project's own. `projectRepository` is false only when the worktree's repository is a
 * different one (a linked repository), for which no session can be started.
 */
export function childRepositoryOf(
  project: RepositoryIdentity | null | undefined,
  workspaceRepository: string | null,
): { readonly repository: string | null; readonly projectRepository: boolean } {
  const own =
    project?.name === undefined ? null : [project.owner, project.name].filter(Boolean).join("/");
  if (workspaceRepository === null) return { repository: own, projectRepository: true };
  const requested = workspaceRepository.trim().toLowerCase();
  const matchesOwn =
    own !== null &&
    (requested === own.toLowerCase() ||
      (!requested.includes("/") && requested === project?.name?.toLowerCase()));
  return { repository: workspaceRepository, projectRepository: matchesOwn };
}
