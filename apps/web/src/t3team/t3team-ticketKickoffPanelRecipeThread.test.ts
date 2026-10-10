import { describe, expect, it, vi } from "vite-plus/test";

import { createTicketThread } from "~/t3team/hooks/t3team-projectThreadFactories";
import { buildThreadForProject } from "~/t3team/hooks/t3team-projectStoreUtils";
import { embeddedKickoffInitialUserMessage } from "~/t3team/t3team-embeddedKickoffInitialUserMessage";
import { requestTicketKickoffPanelRecipeThread } from "~/t3team/t3team-ticketKickoffPanelRecipeThread";
import type { T3TeamKickoffPanelKickoff } from "~/t3team/t3team-TicketKickoffPanelFooter";

const launchConfig = {
  selection: { instanceId: "instance-1", model: "test-model" },
  runtimeMode: "chat",
  interactionMode: "default",
  selectedToolIds: [],
} as const;

describe("side-panel recipe kickoff handoff", () => {
  it("leaves kickoff pending so the mounted chat sends the prompt", () => {
    const onKickoff = vi.fn<T3TeamKickoffPanelKickoff>(() => undefined);
    const prompt = "Investigate the regression and propose a fix.";

    const threadId = requestTicketKickoffPanelRecipeThread({
      onKickoff,
      kickoffMessage: prompt,
      kickoffWorkflow: undefined,
      launchConfig: launchConfig as never,
      contextAttachments: [],
    });

    expect(threadId).toBeUndefined();
    expect(onKickoff).toHaveBeenCalledWith(
      prompt,
      undefined,
      launchConfig.selection,
      launchConfig.runtimeMode,
      launchConfig.interactionMode,
      launchConfig.selectedToolIds,
      [],
      undefined,
    );

    const thread = createTicketThread({
      projectId: "project-1",
      ticketId: "ticket-1",
      ticketDisplayId: "NXAI-8",
      kickoffMessage: prompt,
      kickoffModelSelection: launchConfig.selection as never,
      kickoffRuntimeMode: launchConfig.runtimeMode as never,
      kickoffInteractionMode: launchConfig.interactionMode as never,
      selectedToolIds: [],
      existingThreads: [],
      createThread: (projectId, options) => buildThreadForProject(projectId, options),
    });

    expect(thread.kickoffPending).toBe(true);
    expect(thread.kickoffMessage).toBe(prompt);
    expect(embeddedKickoffInitialUserMessage(thread)).toBe(prompt);
  });

  it("does not hand the prompt to the mounted chat when another sender owns the launch", () => {
    expect(
      embeddedKickoffInitialUserMessage({
        kickoffPending: false,
        kickoffMessage: "Dashboard sidecar sends this.",
      }),
    ).toBeUndefined();
  });
});
