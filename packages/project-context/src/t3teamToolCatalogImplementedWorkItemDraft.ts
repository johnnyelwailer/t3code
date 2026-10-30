import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Thread-bound entry to the existing work-item draft tools: ONE tool with an `op` discriminator,
 * answered by the canonical `t3team.work_item.*.draft_*` tools. Adds no write path; offered only
 * while Jira is bound to the thread's project and the drafts feature is on.
 */
const WORK_ITEM_DRAFT_ENTRY = {
  id: "t3team.work_item.draft",
  label: "Propose work item change",
  title: "Propose a change to a work item of the project",
  description:
    "Propose a change to a work item (ticket) of this thread's project. Nothing is written to " +
    "Jira: the proposal appears in this thread for the user to review and approve or dismiss, and " +
    "only the user commits it. Every work item you name must be in this project, and issue_id is " +
    "required (a key like PROJ-12). One tool; `op` selects the change:\n" +
    "- description: replace the description (issue_id, body)\n" +
    "- comment: add a comment (issue_id, body)\n" +
    "- assignee: assign, or unassign with null (issue_id, assignee_account_id, " +
    "assignee_display_name?)\n" +
    "- estimate: set, or clear with null (issue_id, estimate_value, estimate_mode: points|hours)\n" +
    "- status: move to a state (issue_id, target_status)\n" +
    "- subtask_create: add a subtask (issue_id = the parent, summary, description?, " +
    "estimate_hours?)\n" +
    "- link_add: link two work items (issue_id, other_issue_id, link_type_name, direction: " +
    "inward|outward)\n" +
    "Answer: { ok, promptText, draftMutation }. Not available when no Jira account is connected " +
    "for this project.",
  capabilities: ["write"],
  kind: "draft-mutation",
  surfaces: ["work-item"],
  status: "implemented",
  defaultEnabled: true,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: [
          "description",
          "comment",
          "assignee",
          "estimate",
          "status",
          "subtask_create",
          "link_add",
        ],
      },
      issue_id: { type: "string", minLength: 1, description: "Work item key, e.g. PROJ-12." },
      body: { type: "string" },
      assignee_account_id: { type: ["string", "null"] },
      assignee_display_name: { type: "string" },
      estimate_value: { type: ["number", "null"] },
      estimate_mode: { type: "string", enum: ["points", "hours"] },
      target_status: { type: "string" },
      summary: { type: "string" },
      description: { type: "string" },
      estimate_hours: { type: "number" },
      other_issue_id: { type: "string" },
      link_type_name: { type: "string" },
      direction: { type: "string", enum: ["inward", "outward"] },
    },
    required: ["op", "issue_id"],
  },
} as const satisfies T3TeamToolCatalogEntry;

/** The bulk form: the same operations as one titled change set, proposed all or nothing. */
export const IMPLEMENTED_T3TEAM_WORK_ITEM_DRAFT_TOOL_CATALOG = {
  "t3team.work_item.draft": WORK_ITEM_DRAFT_ENTRY,
  "t3team.work_item.change_set": {
    id: "t3team.work_item.change_set",
    label: "Propose work item changes",
    title: "Propose a set of changes to work items of the project",
    description:
      "Propose several changes to work items of this thread's project as ONE change set for the " +
      "user to review. Nothing is written to Jira: the user approves or rejects each operation, " +
      "and only the user commits. `operations` (1 to 25) are the same objects as " +
      "t3team.work_item.draft takes (op, issue_id, ...). All or nothing: if any operation is " +
      "invalid or names a work item outside this project, nothing is proposed and the answer " +
      "lists the operations (by index) to fix. Answer: { ok, promptText, changeSet }. Not " +
      "available when no Jira account is connected for this project.",
    capabilities: ["write"],
    kind: "draft-mutation",
    surfaces: ["work-item"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120 },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          items: WORK_ITEM_DRAFT_ENTRY.inputSchema,
        },
      },
      required: ["title", "operations"],
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
