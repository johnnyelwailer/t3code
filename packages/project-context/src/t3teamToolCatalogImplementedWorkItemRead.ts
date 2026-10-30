import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Read-only work-item queries. Both are answered for the calling thread's OWN project binding and
 * nothing wider (there is no project argument), and both exist only while a usable tracker account
 * is bound to that project in this environment. Shapes live in `@t3team/sdk`
 * (`packages/t3team-sdk/src/tools/t3team-sdk.workItemRead.ts`).
 */

const WORK_ITEM_SUMMARY_ANSWER =
  "a work item is { provider, issueKey, title, url?, state?, assignee?, labels?, updatedAt?, " +
  "type?, priority?, parentKey?, sprint? }";

export const IMPLEMENTED_T3TEAM_WORK_ITEM_READ_TOOL_CATALOG = {
  "t3team.work_item.search": {
    id: "t3team.work_item.search",
    label: "Search work items",
    title: "Search the project's work items",
    description:
      "Search work items (tickets) of this thread's project by status, assignee, labels, type, " +
      "sprint, free text and/or extra JQL. Filters and JQL are ANDed and results only ever hold " +
      "this project's work items. Filters alone read the host's synced copy; a JQL (or an " +
      "unsynced project) asks the tracker live. " +
      `Answer: { ok, source: 'mirror'|'live', items: [...], nextCursor? } where ${WORK_ITEM_SUMMARY_ANSWER}. ` +
      "Pass nextCursor back as cursor for the next page. Read-only.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["work-item"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "array", items: { type: "string" }, description: "Any of these states." },
        assignee: {
          type: "string",
          description: "Display name or account id; 'unassigned' for work items nobody holds.",
        },
        labels: { type: "array", items: { type: "string" }, description: "All of these labels." },
        type: { type: "string", description: "Issue type, e.g. Bug or Story." },
        sprint: { type: "string", description: "Sprint name or id." },
        text: { type: "string", description: "Free text over title and description." },
        jql: {
          type: "string",
          description: "Extra JQL. ANDed with the filters and the project; it can only narrow.",
        },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Page size, default 25." },
        cursor: { type: "string", description: "nextCursor of the previous page." },
      },
    },
  },
  "t3team.work_item.get": {
    id: "t3team.work_item.get",
    label: "Read work item",
    title: "Read one work item of the project",
    description:
      "Read one work item (ticket) of this thread's project by key: fields, description, " +
      "comments, links and child work items. A key of another project is refused. " +
      "Answer: { ok, item: a work item as t3team.work_item.search returns, plus description?, " +
      "comments: [{ id, author?, body, created? }] (newest 50, oldest first), " +
      "commentsTruncated: true when older comments were left out, links: [{ relation, issueKey }], " +
      "children: [work item] }. links[].issueKey and item.parentKey may name other projects: " +
      "that is the key and relation only, never read such a key. Read-only.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["work-item"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        issueKey: { type: "string", minLength: 1, description: "The work item key, e.g. PROJ-12." },
      },
      required: ["issueKey"],
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
