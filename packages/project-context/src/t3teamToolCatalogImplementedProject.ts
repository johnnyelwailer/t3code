import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Project tools an agent calls about the project it works in. Linked repositories sync on demand:
 * `linked-repositories.json` in the project context lists each with its checkout state, and the
 * agent decides which one it needs cloned or fetched.
 */
export const IMPLEMENTED_T3TEAM_PROJECT_TOOL_CATALOG = {
  "t3team.project.sync_linked_repository": {
    id: "t3team.project.sync_linked_repository",
    label: "Sync linked repository",
    title: "Clone or fetch one linked repository of this project",
    description:
      "Linked repositories are not cloned until something needs them. The project context file " +
      "linked-repositories.json lists each one with its state (cloned / not-cloned / failed), " +
      "its localPath when cloned, and when it was last synced. Call this with one of those " +
      "repositories to clone it on this machine (or fetch it when it is already cloned) before " +
      "reading its code. Waits for the sync by default; a large repository can take minutes, so " +
      "pass wait:false to queue it and keep working. Returns {url, state, localPath?, syncedAt?, " +
      "error?, syncing?}: read the code at localPath once state is 'cloned'.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread", "project"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repository: {
          type: "string",
          minLength: 1,
          description:
            "The linked repository as listed in linked-repositories.json: its URL, or owner/repo.",
        },
        wait: {
          type: "boolean",
          description: "Wait until the clone/fetch has finished. Default true.",
        },
      },
      required: ["repository"],
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
