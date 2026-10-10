import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Tools that write to the repository's host. Unlike the draft tools nothing waits for a human
 * accept step, so they are off by default: a thread gains one only when a user selects it or a
 * launching recipe declares the `mutation.change_request` group.
 */
export const IMPLEMENTED_T3TEAM_CHANGE_REQUEST_TOOL_CATALOG = {
  "t3team.change_request.publish": {
    id: "t3team.change_request.publish",
    label: "Publish change request",
    title: "Commit listed files and open a change request",
    description:
      "From this thread's checkout: commit ONLY the listed repository-relative `paths`, as they " +
      "are in the working tree, onto `branch` (its tip when it exists, else the current HEAD) " +
      "with the user's git identity, without switching the checkout or touching its index; push the branch to " +
      "origin, and open a change request (pull request / merge request) against `base` (default: " +
      "the repository's default branch) on the repository's host. Re-running is safe: when a " +
      "change request for the branch is already open, the branch is pushed and that one is " +
      "returned. Returns {url, number, repository, provider, branch, commit, projectId}; " +
      "projectId is the thread's project, for watching the change request's signals.",
    capabilities: ["write"],
    kind: "mutation",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        branch: { type: "string", minLength: 1, description: "Head branch to publish." },
        base: {
          type: "string",
          description: "Target branch. Omit for the repository's default branch.",
        },
        paths: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
          description:
            "Repository-relative files to commit; a directory commits everything under it. Nothing else is committed.",
        },
        commitMessage: {
          type: "string",
          minLength: 1,
          description: "Commit message; the first line is the subject.",
        },
        title: { type: "string", minLength: 1, description: "Change request title." },
        body: { type: "string", description: "Change request description (markdown)." },
        draft: { type: "boolean", description: "Open it as a draft. Default false." },
      },
      required: ["branch", "paths", "commitMessage", "title", "body"],
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
