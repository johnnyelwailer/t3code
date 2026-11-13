/** What "Open" (or a deep link to a project the app already has) should do. */

export const WORKSPACE_MISSING_MESSAGE = "That project's workspace is no longer available.";

export type OpenExistingDecision =
  | { readonly action: "idle" }
  | { readonly action: "open"; readonly projectId: string }
  | { readonly action: "error"; readonly message: string };

/**
 * Opening an already-added project is a leave of the add-project page, not a
 * standing condition to keep navigating on. A missing workspace is an inline
 * error — never a retry loop.
 */
export function decideOpenExisting(input: {
  readonly existingProjectId: string | null;
  /** False when the bound id is stale or the app project is gone. */
  readonly projectKnown: boolean;
}): OpenExistingDecision {
  if (input.existingProjectId === null) return { action: "idle" };
  if (!input.projectKnown) return { action: "error", message: WORKSPACE_MISSING_MESSAGE };
  return { action: "open", projectId: input.existingProjectId };
}

export function isProjectKnown(
  projectId: string,
  appProjects: ReadonlyArray<{ readonly id: string }>,
): boolean {
  return appProjects.some((project) => project.id === projectId);
}
