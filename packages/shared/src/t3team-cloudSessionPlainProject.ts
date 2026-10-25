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
/** What the dispatch needs of a checkout; the server's richer `CloudSessionSetup` also carries a token. */
export interface CloudSessionPlainCheckout {
  readonly repository: { readonly url: string };
  readonly commit: string;
}

/** Generic so the server can keep its richer checkout (token, author) in the same union. */
export type CloudSessionPlainProject<
  Checkout extends CloudSessionPlainCheckout = CloudSessionPlainCheckout,
> =
  | { readonly kind: "checkout"; readonly checkout: Checkout }
  /** `folder` is `plainProjectFolderName(title, projectId)` (contracts), the workflow's `project_name`. */
  | { readonly kind: "workspace"; readonly folder: string; readonly title: string };

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
