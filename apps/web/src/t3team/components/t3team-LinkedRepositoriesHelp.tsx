/**
 * Copy and banners for the linked-repositories dialog: a short explanation of linked vs
 * main repositories, and a clear message when there is no main (a local workspace will
 * be created) or when the project's own workspace is already the main one.
 */

export const LINKED_REPOSITORIES_HELP =
  "Linked repositories are the code this project reads from (PRs, branches, and files). The main repository is the workspace that holds project state; agents work there.";

export const NO_MAIN_REPOSITORY_MESSAGE =
  "No main repository. A local workspace will be created for this project's state.";

export const ADOPTED_WORKSPACE_MESSAGE =
  "This project's own workspace is the main workspace. Make any linked repository main with one click.";

export function LinkedRepositoriesHelp() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">{LINKED_REPOSITORIES_HELP}</p>
  );
}

export function LinkedRepositoriesWorkspaceBanner({
  mainRepositoryUrl,
  adoptedWorkspace,
}: {
  readonly mainRepositoryUrl: string | null;
  readonly adoptedWorkspace: boolean;
}) {
  if (mainRepositoryUrl !== null) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground"
    >
      {adoptedWorkspace ? ADOPTED_WORKSPACE_MESSAGE : NO_MAIN_REPOSITORY_MESSAGE}
    </p>
  );
}
