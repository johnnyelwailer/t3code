import "./t3team-index.css";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-react";

import {
  nestedEpicStorySubtaskScenario,
  ProjectDashboardKanbanMatrixFixtureView,
  sameLaneNestedSubtasksScenario,
} from "~/t3team/t3team-projectDashboardKanbanMatrixFixtures";

describe("project dashboard kanban matrix browser layout", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nested story shells as solid rectangles that enclose their subtasks", async () => {
    const host = document.createElement("div");
    host.style.width = "1400px";
    host.style.minHeight = "1200px";
    document.body.append(host);
    const screen = await render(
      <ProjectDashboardKanbanMatrixFixtureView scenario={nestedEpicStorySubtaskScenario} />,
      { container: host },
    );

    try {
      const epicShell = host.querySelector(
        '[data-shell-ticket="epic-org"][data-shell-role="spanning"]',
      ) as HTMLElement | null;
      const storyShell = host.querySelector(
        '[data-shell-ticket="story-accepted"][data-shell-role="spanning"]',
      ) as HTMLElement | null;
      const subtaskCard = host.querySelector(
        '[data-ticket-id="subtask-progress"] button > div',
      ) as HTMLElement | null;

      expect(epicShell).toBeTruthy();
      expect(storyShell).toBeTruthy();
      expect(subtaskCard).toBeTruthy();
      expect(
        host.querySelectorAll('[data-shell-ticket="epic-org"][data-shell-role="spanning"]'),
      ).toHaveLength(1);
      expect(
        host.querySelectorAll('[data-shell-ticket="story-accepted"][data-shell-role="spanning"]'),
      ).toHaveLength(1);

      if (!epicShell || !storyShell || !subtaskCard) {
        throw new Error("Expected nested shell test elements to render");
      }

      const epicRect = epicShell.getBoundingClientRect();
      const storyRect = storyShell.getBoundingClientRect();
      const subtaskRect = subtaskCard.getBoundingClientRect();

      expect(epicRect.width).toBeGreaterThan(0);
      expect(storyRect.width).toBeGreaterThan(0);
      expect(storyRect.height).toBeGreaterThan(0);
      expect(storyRect.left - epicRect.left).toBeGreaterThanOrEqual(4);
      expect(epicRect.right - storyRect.right).toBeGreaterThanOrEqual(8);
      expect(storyRect.top).toBeGreaterThanOrEqual(epicRect.top);
      expect(storyRect.bottom).toBeLessThanOrEqual(epicRect.bottom + 1);
      expect(subtaskRect.left).toBeGreaterThanOrEqual(storyRect.left);
      expect(subtaskRect.right).toBeLessThanOrEqual(storyRect.right + 2);
      expect(subtaskRect.top).toBeGreaterThanOrEqual(storyRect.top);
      expect(subtaskRect.bottom).toBeLessThanOrEqual(storyRect.bottom + 1);
    } finally {
      await screen.unmount();
      host.remove();
    }
  });

  it("keeps nested same-lane children close to their parent while preserving the outer shell", async () => {
    const host = document.createElement("div");
    host.style.width = "1400px";
    host.style.minHeight = "1200px";
    document.body.append(host);
    const screen = await render(
      <ProjectDashboardKanbanMatrixFixtureView scenario={sameLaneNestedSubtasksScenario} />,
      { container: host },
    );

    try {
      const storyCard = host.querySelector(
        '[data-ticket-id="story-same-lane"] button > div',
      ) as HTMLElement | null;
      const subtaskCard = host.querySelector(
        '[data-ticket-id="subtask-same-lane"] button > div',
      ) as HTMLElement | null;
      const epicShell = host.querySelector(
        '[data-shell-ticket="epic-same-lane"][data-shell-role="spanning"]',
      ) as HTMLElement | null;
      const storyShell = host.querySelector(
        '[data-shell-ticket="story-same-lane"][data-shell-role="single-lane"]',
      ) as HTMLElement | null;

      expect(storyCard).toBeTruthy();
      expect(subtaskCard).toBeTruthy();
      expect(epicShell).toBeTruthy();
      expect(storyShell).toBeTruthy();

      if (!storyCard || !subtaskCard || !epicShell || !storyShell) {
        throw new Error("Expected same-lane nested shell elements to render");
      }

      const storyCardRect = storyCard.getBoundingClientRect();
      const subtaskCardRect = subtaskCard.getBoundingClientRect();
      const epicShellRect = epicShell.getBoundingClientRect();
      const storyShellRect = storyShell.getBoundingClientRect();

      expect(subtaskCardRect.top - storyCardRect.bottom).toBeLessThanOrEqual(8);
      expect(storyShellRect.left - epicShellRect.left).toBeGreaterThanOrEqual(4);
      expect(epicShellRect.right - storyShellRect.right).toBeGreaterThanOrEqual(8);
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});
