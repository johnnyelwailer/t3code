/**
 * The last step of the chain: the launch thread must actually expose the tool the run was granted.
 *
 * Live, everything up to here worked — thread created, ask answered, writer turn produced a real
 * description — and then:
 *   Workflow run failed: Tool 't3team.work_item.description.draft_update' is not enabled for this thread.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vite-plus/test";

import { resolveT3TeamWorkflowGrantedToolIds } from "~/t3team/chat/t3team-workflowGrantedToolIds";
import {
  createT3TeamTurnToolContext,
  DEFAULT_T3TEAM_THREAD_TOOL_IDS,
} from "~/t3team/t3team-threadToolContext";
import { buildWorkItemRewriteWorkflow } from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";

const DRAFT_TOOL = "t3team.work_item.description.draft_update";

function rewriteWorkflow() {
  const workflow = buildWorkItemRewriteWorkflow({
    issueIdOrKey: "NXAI-8",
    projectWorkspaceRoot: "/tmp/project-alpha",
  });
  if (!workflow) throw new Error("expected a workflow");
  return workflow;
}

describe("resolveT3TeamWorkflowGrantedToolIds", () => {
  it("maps mutation.draft onto the draft tools the thread defaults omit", () => {
    // The premise of the bug: the thread-surface defaults do not carry the draft tool.
    expect(DEFAULT_T3TEAM_THREAD_TOOL_IDS).not.toContain(DRAFT_TOOL);

    expect(resolveT3TeamWorkflowGrantedToolIds(["integration.read", "mutation.draft"])).toContain(
      DRAFT_TOOL,
    );
  });

  it("grants nothing for a workflow that declares no groups", () => {
    expect(resolveT3TeamWorkflowGrantedToolIds(undefined)).toEqual([]);
    expect(resolveT3TeamWorkflowGrantedToolIds([])).toEqual([]);
    // Read-only groups must not smuggle in write tools.
    expect(resolveT3TeamWorkflowGrantedToolIds(["integration.read"])).toEqual([]);
  });
});

describe("the describe-rewrite launch thread's tool context", () => {
  it("contains the draft tool the workflow body calls", () => {
    const workflow = rewriteWorkflow();
    // What the recipe manifest declares, and therefore what the run's host_tool_grant holds.
    expect(workflow.allowedToolGroups).toContain("mutation.draft");

    const toolContext = createT3TeamTurnToolContext({
      projectId: "project-1",
      projectTitle: "Nexi AI",
      threadId: "thread-1",
      threadTitle: "NXAI-8 kickoff 1",
      ticketId: "ticket-1",
      ticketDisplayId: "NXAI-8",
      kickoffWorkflow: workflow,
      selectedToolIds: [
        ...DEFAULT_T3TEAM_THREAD_TOOL_IDS,
        ...resolveT3TeamWorkflowGrantedToolIds(workflow.allowedToolGroups),
      ],
    });

    const toolIds = toolContext?.tools.map((tool) => tool.id) ?? [];
    expect(toolIds).toContain(DRAFT_TOOL);
    // The thread keeps everything it had; the grant only adds.
    for (const defaultToolId of DEFAULT_T3TEAM_THREAD_TOOL_IDS) {
      expect(toolIds).toContain(defaultToolId);
    }
  });

  it("does not expose draft tools on a thread launching nothing", () => {
    const toolContext = createT3TeamTurnToolContext({
      projectId: "project-1",
      projectTitle: "Nexi AI",
      threadId: "thread-2",
      threadTitle: "Plain chat",
    });

    expect(toolContext?.tools.map((tool) => tool.id) ?? []).not.toContain(DRAFT_TOOL);
  });
});
