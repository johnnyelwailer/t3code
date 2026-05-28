import { describe, expect, it } from "vitest";

import { buildThreadKickoffHistoryMessage } from "~/t3work/chat/t3work-threadKickoffHistoryMessage";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

const GUIDED_WORKFLOW: T3workKickoffWorkflow = {
  kind: "recipe",
  recipeId: "create-contextual-recipe",
  title: "Create a recipe for this context",
  description: "Design a contextual recipe for the current surface.",
  source: "bundled",
  surface: "project.dashboard",
  kickoff: {
    version: 1,
    steps: [
      {
        kind: "wait-for-kickoff-input",
        id: "collect-brief",
        when: "missing-prompt",
        promptRequest: {
          title: "Recipe kickoff",
        },
      },
      {
        kind: "run-interactive-agent",
        id: "author",
      },
    ],
  },
};

describe("buildThreadKickoffHistoryMessage", () => {
  it("builds a system history message for guided recipe launches", () => {
    expect(
      buildThreadKickoffHistoryMessage({
        threadId: "thread-1",
        createdAt: "2026-05-28T10:00:00.000Z",
        kickoffMessage: "Recipe authoring kickoff",
        kickoffPending: false,
        kickoffWorkflow: GUIDED_WORKFLOW,
      }),
    ).toMatchObject({
      role: "system",
      text: "Recipe authoring kickoff",
      createdAt: "2026-05-28T10:00:00.000Z",
      streaming: false,
    });
  });

  it("does not build a system history message for direct-launch recipes", () => {
    expect(
      buildThreadKickoffHistoryMessage({
        threadId: "thread-1",
        createdAt: "2026-05-28T10:00:00.000Z",
        kickoffMessage: "Recipe authoring kickoff",
        kickoffPending: true,
        kickoffWorkflow: GUIDED_WORKFLOW,
      }),
    ).toBeUndefined();
  });
});
