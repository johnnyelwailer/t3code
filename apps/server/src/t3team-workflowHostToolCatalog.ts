/**
 * The exact broker tools a workflow body may reach via `getTools()`, each with the group the body
 * must declare. Kept separate from the call/grant wiring so that module stays under the LOC ceiling.
 *
 * @module t3team-workflowHostToolCatalog
 */
import { defineToolGroup } from "@t3team/sdk";

/**
 * Reuses the id of the broker-side draft classification (`PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP`)
 * so bodies, the permission UI and the audit log speak ONE vocabulary.
 */
const T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP = defineToolGroup({
  id: "mutation.draft",
  label: "Propose work-item drafts",
  description:
    "Prepare reviewable work-item drafts (description, comment, assignee, estimate, status, subtask, links). A human accepts the draft before anything is written to the tracker.",
});

/** Same id as `PROJECT_RECIPE_MUTATION_CHANGE_REQUEST_TOOL_GROUP`. */
const T3TEAM_WORKFLOW_CHANGE_REQUEST_TOOL_GROUP = defineToolGroup({
  id: "mutation.change_request",
  label: "Publish change requests",
  description:
    "Commit the listed files, push a branch, and open a pull or merge request on the repository's host. This writes immediately; there is no review step.",
});

/** Same id as `PROJECT_RECIPE_MUTATION_REPOSITORY_SECRET_TOOL_GROUP`. */
const T3TEAM_WORKFLOW_REPOSITORY_SECRET_TOOL_GROUP = defineToolGroup({
  id: "mutation.repository_secret",
  label: "Set repository secrets",
  description:
    "Ask for a secret through a masked card and write it as a repository Actions secret. The agent never sees the value.",
});

const T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS = [
  "t3team.work_item.description.draft_update",
  "t3team.work_item.comment.draft_create",
  "t3team.work_item.assignee.draft_update",
  "t3team.work_item.estimate.draft_update",
  "t3team.work_item.status.draft_update",
  "t3team.work_item.subtask.draft_create",
  "t3team.work_item.link.draft_create",
  "t3team.work_item.link.draft_remove",
] as const;

/** The exact broker tools reachable from a workflow body, each with the group a body must declare
 * to call it. Nothing outside this table is reachable. */
export const T3TEAM_WORKFLOW_HOST_TOOLS = [
  ...T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS.map((id) => ({
    id,
    group: T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP,
  })),
  { id: "t3team.change_request.publish", group: T3TEAM_WORKFLOW_CHANGE_REQUEST_TOOL_GROUP },
  { id: "t3team.repository_secret.set", group: T3TEAM_WORKFLOW_REPOSITORY_SECRET_TOOL_GROUP },
] as const;

export type T3TeamWorkflowHostToolEntry = (typeof T3TEAM_WORKFLOW_HOST_TOOLS)[number];
