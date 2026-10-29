import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Machine tools an agent calls while setting up a project's machine. `find_definitions` is
 * read-only: it looks for definitions that already exist before the agent asks the user where one
 * is. Like `t3team.project.sync_linked_repository` it is served directly by the MCP toolkit.
 */
export const IMPLEMENTED_T3TEAM_MACHINE_TOOL_CATALOG = {
  "t3team.machine.find_definitions": {
    id: "t3team.machine.find_definitions",
    label: "Find machine definitions",
    title: "Find existing machine definitions in this project's repositories",
    description:
      "Looks in this project's own repository and its linked repositories for a machine " +
      "definition someone already wrote: .nexi/machine.json or a devcontainer, on the default " +
      "branch, on other branches, on open pull requests and on pull requests closed in the last " +
      "30 days (at most 20 refs per repository). Call it before asking the user which repository " +
      "or branch holds their machine, and propose what it finds. Read-only, through the user's " +
      "own sign-in. Returns {candidates: [{repository, ref, where, path, kind, author, summary, " +
      "commit}], checked: [{repository, refs, omitted}], unreadable: [{repository, reason}], " +
      "setupHints: [{repository, ref, path}]}. setupHints lists Dockerfile, .npmrc, .env.example " +
      "and bootstrap or setup scripts that exist beside a definition, without reading them.",
    capabilities: ["read"],
    kind: "thread",
    surfaces: ["thread", "project"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: {
          type: "string",
          minLength: 1,
          description: "The project to search. Default: this thread's project.",
        },
      },
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
