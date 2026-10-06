/**
 * What a digest recipe action is about: the change request it sits on and, when the digest knows
 * it, the ticket that change request belongs to. It travels with the action so a click can stage
 * the recipe scoped to exactly this PR, not to whatever the dashboard happens to show.
 */
export type DigestRecipeScope = {
  readonly projectId: string;
  readonly changeRequest: {
    readonly host?: string;
    readonly repo: string;
    readonly number: number;
    readonly title?: string;
  };
  readonly workItem?: { readonly key: string; readonly title?: string };
};

/**
 * One concrete next step on a digest item: either a link (open thread / PR / CI) or a recipe
 * starter (stages a recipe, e.g. "handle review comments", in the dashboard's kickoff composer).
 * Items carry 0..n; the first is primary and always visible, the rest reveal on row hover. A
 * recipe starter without a `scope` has nothing to launch against and renders nothing.
 */
export type DigestItemAction = {
  readonly label: string;
  readonly href?: string;
  readonly recipe?: string;
  readonly scope?: DigestRecipeScope;
};

export function digestChangeRequestScope(input: {
  readonly projectId: string | undefined;
  readonly host?: string | undefined;
  readonly repo: string;
  readonly number: number;
  readonly title?: string | undefined;
  readonly workItem?: { readonly key: string; readonly title?: string | undefined } | undefined;
}): DigestRecipeScope | undefined {
  if (!input.projectId) return undefined;
  return {
    projectId: input.projectId,
    changeRequest: {
      ...(input.host ? { host: input.host } : {}),
      repo: input.repo,
      number: input.number,
      ...(input.title ? { title: input.title } : {}),
    },
    ...(input.workItem
      ? {
          workItem: {
            key: input.workItem.key,
            ...(input.workItem.title ? { title: input.workItem.title } : {}),
          },
        }
      : {}),
  };
}
