/**
 * What a plain cloud session (a project with no machine definition) runs its server in, so the
 * session's machine always holds the project it was started for:
 *
 * - `checkout`: the project's own repository, cloned on the session host at a pinned commit with
 *   the user's token (the same access a machine setup uses), no devcontainer.
 * - `workspace`: a project with no remote has nothing to clone, so the session starts an empty
 *   folder named after it. It persists with the session's workspace like any project the app
 *   created there, so the next session in that workspace finds the same folder.
 *
 * Either way the session server registers its working directory as its project
 * (`--auto-bootstrap-project-from-cwd`); that is the project the client binds the session to.
 *
 * @module t3team-cloudSessionPlainProject
 */
import type { CloudSessionSetup } from "./t3team-CloudSessionMachine.ts";

export type CloudSessionPlainProject =
  | { readonly kind: "checkout"; readonly checkout: CloudSessionSetup }
  | { readonly kind: "workspace"; readonly folder: string };

const FOLDER_LIMIT = 64;

/**
 * The session workflow's `project_name`: one path segment of `[A-Za-z0-9 ._-]`, starting with a
 * letter or digit, at most 64 characters (the workflow refuses anything else). Keeps the title
 * readable ("IES NG" stays "IES NG"); a title with nothing usable falls back to "project".
 */
export function plainProjectFolderName(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 ._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, FOLDER_LIMIT)
    .trimEnd();
  return cleaned.length > 0 ? cleaned : "project";
}

/** The `workflow_dispatch` inputs that hand the plain session its project. */
export function plainProjectDispatchInputs(
  project: CloudSessionPlainProject | null | undefined,
): Record<string, string> {
  if (!project) return {};
  return project.kind === "checkout"
    ? {
        project_repository: project.checkout.repository.url,
        project_commit: project.checkout.commit,
      }
    : { project_name: project.folder };
}
