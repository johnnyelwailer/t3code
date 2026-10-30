import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Machine tools an agent calls while setting up a project's machine. `find_definitions` is
 * read-only: it looks for definitions that already exist before the agent asks the user where one
 * is. `set_source` proposes one: it proves the proposal and asks the user, and saves nothing (the
 * setting lives on the user's own environment, where only their answer applies it). Like
 * `t3team.project.sync_linked_repository` both are served directly by the MCP toolkit.
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
  "t3team.machine.set_source": {
    id: "t3team.machine.set_source",
    label: "Propose machine source",
    title: "Propose a repository and branch as this project's machine source",
    description:
      "Proposes the repository and branch that hold this project's machine definition. Call " +
      "t3team.machine.find_definitions first and propose what it found; do not ask the user " +
      "for a repository you can look up. The proposal is checked before the user sees it: the " +
      "repository must be readable and the branch must hold a usable machine definition, else " +
      "the tool fails with the reason so you can correct it. It then asks the user one " +
      "question (accept or keep the default). Nothing is saved by this tool: never tell the " +
      "user it was applied. Their accept or decline arrives as their next message; wait for " +
      "it. Explain WHY in 'why' (one or two sentences the user reads, for instance who wrote " +
      "the definition and what it sets up). Returns {asked, requestId, questionId, " +
      "repository, branch, note}. One question can be pending per thread.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread", "project"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "why"],
      properties: {
        repository: {
          type: "string",
          minLength: 1,
          description: "The repository: owner/repo on this project's host, or an https URL.",
        },
        branch: {
          type: "string",
          minLength: 1,
          description: "The branch holding the definition. Default: the default branch.",
        },
        why: {
          type: "string",
          minLength: 1,
          description: "One or two sentences the user reads: why this source.",
        },
        author: {
          type: "string",
          minLength: 1,
          description: "Who wrote the definition, when known.",
        },
      },
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
