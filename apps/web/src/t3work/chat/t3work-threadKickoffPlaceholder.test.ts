import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  isWaitingForKickoffInput,
  shouldShowThreadKickoffPlaceholder,
  ThreadKickoffPlaceholder,
} from "~/t3work/chat/t3work-threadKickoffPlaceholder";
import { buildT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";
import type { ProjectShellProject } from "@t3tools/project-context";

function createProject(profileId: string): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: {
        agentSetup: {
          profileId,
        },
      },
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("shouldShowThreadKickoffPlaceholder", () => {
  it("shows when a kickoff message exists and no live messages are present", () => {
    expect(
      shouldShowThreadKickoffPlaceholder({
        kickoffMessage: "Review the ticket and propose a plan.",
        serverMessageCount: 0,
      }),
    ).toBe(true);
  });

  it("shows before the live thread shell exists", () => {
    expect(
      shouldShowThreadKickoffPlaceholder({
        kickoffMessage: "Review the ticket and propose a plan.",
        serverMessageCount: null,
      }),
    ).toBe(true);
  });

  it("hides once the live thread has messages", () => {
    expect(
      shouldShowThreadKickoffPlaceholder({
        kickoffMessage: "Review the ticket and propose a plan.",
        serverMessageCount: 1,
      }),
    ).toBe(false);
  });

  it("hides once the durable recipe launch activity is present", () => {
    expect(
      shouldShowThreadKickoffPlaceholder({
        kickoffMessage: "Review the ticket and propose a plan.",
        serverMessageCount: 0,
        hasServerLaunchActivity: true,
      }),
    ).toBe(false);
  });

  it("hides when there is no kickoff message", () => {
    expect(
      shouldShowThreadKickoffPlaceholder({
        kickoffMessage: undefined,
        serverMessageCount: 0,
      }),
    ).toBe(false);
  });

  it("keeps recipe workflow metadata on quick starts for structured kickoff rendering", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "PROJ-123",
      resourceKind: "ticket",
      availableContextKeys: ["project.summary", "ticket.summary"],
    });

    expect(quickStarts[0]?.workflow).toMatchObject({
      kind: "recipe",
      title: quickStarts[0]?.title,
      description: quickStarts[0]?.description,
      source: "bundled",
    });
  });

  it("treats recipe workflows with a wait-for-kickoff-input step as guided launches", () => {
    const createRecipe = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 6,
        bugCount: 1,
        primaryBugLabel: "IES-100",
      },
      availableContextKeys: ["project.summary"],
    }).find((recipe) => recipe.id === "create-contextual-recipe");

    expect(isWaitingForKickoffInput(createRecipe?.workflow, false)).toBe(true);
    expect(isWaitingForKickoffInput(createRecipe?.workflow, true)).toBe(false);
  });

  it("renders kickoff content in a scrollable card", () => {
    const markup = renderToStaticMarkup(
      createElement(ThreadKickoffPlaceholder, {
        message: Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join("\n"),
      }),
    );

    expect(markup).toContain("max-h-[min(50dvh,28rem)]");
    expect(markup).toContain("overflow-x-hidden");
    expect(markup).toContain("overflow-y-auto");
  });
});
