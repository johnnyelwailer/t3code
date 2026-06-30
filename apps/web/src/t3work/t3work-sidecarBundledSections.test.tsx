import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { resolveSidecarSectionItemOrder } from "@t3tools/project-recipes";
import { describe, expect, it, vi } from "vite-plus/test";

const { mockUseQuickStarts } = vi.hoisted(() => ({
  mockUseQuickStarts: vi.fn(),
}));

vi.mock("~/t3work/t3work-sidecarRecipes", () => ({
  useT3workSidecarRecipeQuickStarts: (input: unknown) => mockUseQuickStarts(input),
}));

vi.mock("@t3tools/t3work-skill-packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@t3tools/t3work-skill-packs")>();
  return {
    ...actual,
    getBundledT3WorkRecipe: (recipeId: string) => ({
      ...actual.getBundledT3WorkRecipe(recipeId),
      topic: "quick-actions",
    }),
  };
});

vi.mock("~/t3work/t3work-KickoffRecipeList", () => ({
  T3workKickoffRecipeList: ({ recipes }: { recipes: ReadonlyArray<{ id: string }> }) => {
    return <div>{recipes.map((recipe) => recipe.id).join(",")}</div>;
  },
}));

vi.mock("~/t3work/t3work-ProjectDashboardRecentConversations", () => ({
  T3workRecentConversations: ({ threads }: { threads: ReadonlyArray<{ id: string }> }) => {
    return <div>{threads.map((thread) => thread.id).join(",")}</div>;
  },
}));

import { T3workQuickStartsSection } from "~/t3work/t3work-QuickStartsSection";
import { T3workRecentConversationsSection } from "~/t3work/t3work-RecentConversationsSection";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";

const project: ProjectShellProject = {
  id: "project-1" as ProjectShellProject["id"],
  title: "Inbox Export Service",
  source: {
    provider: "local",
    externalProjectId: "project-1",
    raw: {},
  },
  workspace: {
    rootPath: "/tmp/project-1",
    createdAt: "2026-05-27T09:00:00.000Z",
  },
  createdAt: "2026-05-27T09:00:00.000Z",
  updatedAt: "2026-05-27T09:00:00.000Z",
};

const host: SidecarSectionHost = {
  placement: "sidecar.section",
  surface: "project.dashboard.backlog",
  projectId: "project-1",
  stageKickoff: vi.fn(),
  launchRecipe: vi.fn(),
  openThread: vi.fn(),
};

function buildOrderedItemIds(itemIds: ReadonlyArray<string>) {
  return resolveSidecarSectionItemOrder({
    itemIds,
    personalization: {
      hiddenItemIds: [itemIds[1] ?? ""],
      pinnedItemIds: [itemIds[2] ?? ""],
      orderOverrideItemIds: [],
    },
  });
}

describe("bundled sidecar sections", () => {
  it("applies hidden and pinned quick-start item order before rendering", () => {
    mockUseQuickStarts.mockReturnValue([
      {
        id: "recipe-a",
        title: "Recipe A",
        description: "A",
        prompt: "A",
        workflow: {
          kind: "recipe",
          recipeId: "recipe-a",
          title: "Recipe A",
          description: "A",
          source: "bundled",
          surface: "project.dashboard.backlog",
        },
      },
      {
        id: "recipe-b",
        title: "Recipe B",
        description: "B",
        prompt: "B",
        workflow: {
          kind: "recipe",
          recipeId: "recipe-b",
          title: "Recipe B",
          description: "B",
          source: "bundled",
          surface: "project.dashboard.backlog",
        },
      },
      {
        id: "recipe-c",
        title: "Recipe C",
        description: "C",
        prompt: "C",
        workflow: {
          kind: "recipe",
          recipeId: "recipe-c",
          title: "Recipe C",
          description: "C",
          source: "bundled",
          surface: "project.dashboard.backlog",
        },
      },
    ]);

    const markup = renderToStaticMarkup(
      <T3workQuickStartsSection
        host={host}
        props={{
          recipeInput: {
            backend: null,
            surface: "project.dashboard",
            project,
            selectedWorkLabel: project.title,
            dashboardMode: "backlog",
          },
          topic: "quick-actions",
          shell: {
            orderItemIds: buildOrderedItemIds,
          },
        }}
      />,
    );

    expect(markup).toContain("recipe-c,recipe-a");
    expect(markup).not.toContain("recipe-b");
  });

  it("applies hidden and pinned recent-conversation order before rendering", () => {
    const markup = renderToStaticMarkup(
      <T3workRecentConversationsSection
        host={host}
        props={{
          threads: [
            {
              id: "thread-a",
              title: "Thread A",
              ticketId: null,
              messageCount: 3,
              lastMessageAt: "2026-05-29T09:00:00.000Z",
            },
            {
              id: "thread-b",
              title: "Thread B",
              ticketId: null,
              messageCount: 2,
              lastMessageAt: "2026-05-28T09:00:00.000Z",
            },
            {
              id: "thread-c",
              title: "Thread C",
              ticketId: null,
              messageCount: 1,
              lastMessageAt: "2026-05-27T09:00:00.000Z",
            },
          ],
          shell: {
            orderItemIds: buildOrderedItemIds,
          },
        }}
      />,
    );

    expect(markup).toContain("thread-c,thread-a");
    expect(markup).not.toContain("thread-b");
  });
});
