/**
 * The whole no-thread chain for a staged rewrite, stitched from the REAL functions.
 *
 * The launch-shape tests assert what a launch looks like. They do not assert that the thread the
 * launch needs ever gets created, and that is exactly where this path broke live: the aside sat on
 * "Creating thread…" forever, `thread.create` never reached the server, and
 * `launchRecipeWorkflow` was never called — silently.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { clearThreadBootstrapDispatchStates } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { readThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { planThreadBootstrap } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { runThreadBootstrap } from "~/t3team/chat/t3team-runThreadBootstrap";
import { createTicketThread } from "~/t3team/hooks/t3team-projectThreadFactories";
import { buildThreadForProject } from "~/t3team/hooks/t3team-projectStoreUtils";
import { buildT3TeamComposerKickoff } from "~/t3team/t3team-stagedComposerKickoff";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import type { ProjectThread } from "~/t3team/t3team-types";
import { addDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";
import {
  buildWorkItemRewriteSelectedRecipe,
  WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
  WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
} from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";

const WORKSPACE_ROOT = "/tmp/project-alpha";
const RECIPE_PATH = `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`;

function stagedRewrite(): T3TeamStagedComposerAction {
  const selectedRecipe = buildWorkItemRewriteSelectedRecipe({
    issueIdOrKey: "NXAI-8",
    summary: "Dev-Rolle",
    currentBody: "Current text.",
    projectWorkspaceRoot: WORKSPACE_ROOT,
  });
  if (!selectedRecipe) throw new Error("expected a selected recipe");
  return {
    selectedRecipe,
    composerNoteParameter: WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER,
    commentsParameter: WORK_ITEM_REWRITE_COMMENTS_PARAMETER,
    comments: addDiffComment([], {
      blockId: "description",
      quote: "the description",
      body: "Add acceptance criteria and state who the Dev-Rolle is for.",
    }),
  };
}

/** The composer's send, exactly as `TicketKickoffPanelFooter` performs it. */
function composerSubmit(composerText: string) {
  return buildT3TeamComposerKickoff({ stagedAction: stagedRewrite(), composerText });
}

/** `TicketDetailKickoffAside.onKickoff` → `createTicketKickoffThread` → the store factory. */
function createLocalThread(kickoff: ReturnType<typeof composerSubmit>): ProjectThread {
  return createTicketThread({
    projectId: "project-1",
    ticketId: "ticket-1",
    ticketDisplayId: "NXAI-8",
    kickoffMessage: kickoff.kickoffMessage,
    ...(kickoff.kickoffPending !== undefined ? { kickoffPending: kickoff.kickoffPending } : {}),
    kickoffModelSelection: { instanceId: "instance-1", model: "test-model" } as never,
    kickoffRuntimeMode: "chat" as never,
    kickoffInteractionMode: "default" as never,
    selectedToolIds: [],
    ...(kickoff.workflow ? { kickoffWorkflow: kickoff.workflow } : {}),
    existingThreads: [],
    createThread: (projectId, options) => buildThreadForProject(projectId, options),
  });
}

function backendSpy() {
  const dispatchCommand = vi.fn().mockResolvedValue(undefined);
  const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
  const syncThreadToolContext = vi.fn().mockResolvedValue(undefined);
  return {
    dispatchCommand,
    launchRecipeWorkflow,
    syncThreadToolContext,
    backend: {
      dispatchCommand,
      launchRecipeWorkflow,
      syncThreadToolContext,
    } as unknown as BackendApi,
  };
}

/** `ThreadChatView` + `useThreadBootstrap`, minus React: the same derivation and the same plan. */
async function bootstrapMountedThread(thread: ProjectThread, backend: BackendApi) {
  const initialUserMessage =
    thread.kickoffPending && thread.kickoffMessage ? thread.kickoffMessage : undefined;
  const plan = planThreadBootstrap({
    currentState: readThreadBootstrapDispatchState(thread.id),
    threadId: thread.id,
    hasServerThread: false,
    hasInitialUserMessage: Boolean(initialUserMessage),
    hasProjectWorkspaceRoot: true,
    projectExists: true,
  });

  // `useThreadBootstrap` returns before dispatching when there is nothing to do; mirror that so the
  // action handed on is the same narrowed union the real caller passes.
  if (plan.action === "none") {
    return plan;
  }

  await runThreadBootstrap({
    backend,
    environmentId: "env-1",
    threadId: thread.id,
    projectTitle: "Nexi AI",
    projectWorkspaceRoot: WORKSPACE_ROOT,
    canonicalProjectId: "project-1",
    title: thread.title,
    initialUserMessage,
    kickoffModelSelection: { instanceId: "instance-1", model: "test-model" } as never,
    kickoffRuntimeMode: "chat" as never,
    kickoffInteractionMode: "default" as never,
    kickoffBranch: null,
    ...(thread.kickoffWorkflow ? { kickoffWorkflow: thread.kickoffWorkflow } : {}),
    createdAt: new Date().toISOString(),
    shouldEnsureProject: plan.shouldEnsureProject,
    action: plan.action,
    state: plan.state,
    onInitialUserMessageSent: undefined,
  });

  return plan;
}

describe("composer submit with a staged rewrite and no existing thread", () => {
  beforeEach(() => {
    clearThreadBootstrapDispatchStates();
  });

  it("carries the workflow onto the local thread so the bootstrap can plan a kickoff", () => {
    const thread = createLocalThread(composerSubmit(""));

    // If any of these are lost the bootstrap silently degrades: no kickoffMessage means no
    // `initialUserMessage`, which plans a bare `create` and never launches.
    expect(thread.kickoffMessage?.trim().length ?? 0).toBeGreaterThan(0);
    expect(thread.kickoffPending).toBe(true);
    expect(thread.kickoffWorkflow?.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
  });

  it("dispatches thread.create AND reaches launchRecipeWorkflow", async () => {
    const spy = backendSpy();
    const thread = createLocalThread(composerSubmit("Keep it under 150 words."));

    const plan = await bootstrapMountedThread(thread, spy.backend);
    expect(plan.action).toBe("kickoff");

    const dispatchedTypes = spy.dispatchCommand.mock.calls.map(
      (call) => (call[0] as { type: string }).type,
    );
    // The regression: the thread the launch needs must actually be created.
    expect(dispatchedTypes).toContain("thread.create");
    // ...and no model turn, ever, on this path.
    expect(dispatchedTypes).not.toContain("thread.turn.start");

    expect(spy.launchRecipeWorkflow).toHaveBeenCalledTimes(1);
    const request = spy.launchRecipeWorkflow.mock.calls[0]?.[0] as {
      launch: { recipePath: string; parameters: Record<string, unknown> };
    };
    expect(request.launch.recipePath).toBe(RECIPE_PATH);
    expect(request.launch.parameters[WORK_ITEM_REWRITE_INSTRUCTIONS_PARAMETER]).toBe(
      "Keep it under 150 words.",
    );
    expect(request.launch.parameters[WORK_ITEM_REWRITE_COMMENTS_PARAMETER]).toHaveLength(1);
  });

  /**
   * The live failure mode: the thread never appeared, the launch was never requested, and nothing
   * was thrown. Anything on the way to the launch that talks to the network can do that, so the
   * durable thread must not sit behind it.
   */
  it("still creates the thread when the tool-context sync never settles", async () => {
    const spy = backendSpy();
    spy.syncThreadToolContext.mockReturnValue(new Promise(() => {}));
    const thread = createLocalThread(composerSubmit(""));

    const bootstrap = bootstrapMountedThread(thread, spy.backend);
    const settled = await Promise.race([
      bootstrap.then(() => "settled" as const),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);

    // The bootstrap is legitimately still hanging on the enrichment call...
    expect(settled).toBe("pending");
    // ...but the thread the user is staring at exists, instead of "Creating conversation" forever.
    const dispatchedTypes = spy.dispatchCommand.mock.calls.map(
      (call) => (call[0] as { type: string }).type,
    );
    expect(dispatchedTypes).toContain("thread.create");
  });
});
