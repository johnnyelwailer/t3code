import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import {
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_CONTEXT_ROOT,
  T3TEAM_WORK_ITEMS_INDEX_PATH,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";

import { buildProjectContextBundle } from "~/t3team/t3team-projectContextBundle";
import type { ProjectTicket } from "~/t3team/t3team-types";

function createProject(): ProjectShellProject {
  return {
    id: "Project Alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "proj-1",
      externalProjectKey: "PROJ",
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

function createTicket(key: string): ProjectTicket {
  return {
    id: key.toLowerCase(),
    projectId: "Project Alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: `Ticket ${key}`,
      type: "Task",
      url: `https://example.test/browse/${key}`,
      projectId: "PROJ",
    },
    issueType: "Task",
    status: "In Progress",
    updatedAt: "2026-05-18T12:00:00.000Z",
  };
}

describe("buildProjectContextBundle", () => {
  it("writes a stable project entrypoint and ticket references", () => {
    const project = createProject();
    const bundle = buildProjectContextBundle({
      project,
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      projectTickets: [createTicket("PROJ-1"), createTicket("PROJ-2")],
    });

    expect(bundle.bundleRootRelativePath).toBe(T3TEAM_PROJECT_CONTEXT_ROOT);
    expect(bundle.fileReferences).toEqual([
      {
        label: "Project entrypoint",
        relativePath: T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
      },
    ]);

    const entryPoint = bundle.files.find(
      (file) => file.relativePath === T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
    );
    expect(entryPoint).toBeDefined();
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      kind: "project",
      paths: {
        workItemsIndex: T3TEAM_WORK_ITEMS_INDEX_PATH,
      },
    });

    const workItemsIndex = bundle.files.find(
      (file) => file.relativePath === T3TEAM_WORK_ITEMS_INDEX_PATH,
    );
    expect(JSON.parse(workItemsIndex?.contents ?? "{}")).toMatchObject({
      workItems: [
        {
          key: "PROJ-1",
          availability: "summary",
          loadableOnDemand: true,
          ticketEntryPointRelativePath: buildJiraTicketEntryPoint("Project Alpha", "PROJ-1"),
        },
        {
          key: "PROJ-2",
          ticketEntryPointRelativePath: buildJiraTicketEntryPoint("Project Alpha", "PROJ-2"),
        },
      ],
    });
  });

  it("does not publish an empty work-items index before tickets are known", () => {
    const bundle = buildProjectContextBundle({
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      visibleContext: {
        uiState: { surface: "dashboard-shell", visibleThreadCount: 1 },
      },
    });

    expect(
      bundle.files.some((file) => file.relativePath === T3TEAM_WORK_ITEMS_INDEX_PATH),
    ).toBe(false);
    expect(
      JSON.parse(
        bundle.files.find((file) => file.relativePath === T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH)
          ?.contents ?? "{}",
      ).paths,
    ).not.toHaveProperty("workItemsIndex");
  });

  it("writes visible UI, thread, and GitHub activity context", () => {
    const bundle = buildProjectContextBundle({
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      projectTickets: [createTicket("PROJ-1")],
      visibleContext: {
        projectThreads: [
          {
            id: "thread-1",
            projectId: "Project Alpha",
            title: "Kickoff",
            lastMessageAt: "2026-05-18T13:00:00.000Z",
            createdAt: "2026-05-18T12:30:00.000Z",
            status: "idle",
          },
        ],
        githubActivityItems: [
          {
            id: "gh-1",
            repository: "example/project-alpha",
            reason: "review-requested",
            subjectTitle: "PROJ-1 Add feature",
            workItemKey: "PROJ-1",
          },
        ],
        uiState: { surface: "my-work", viewMode: "kanban" },
      },
    });

    expect(
      bundle.files.some((file) => file.relativePath === `${T3TEAM_PROJECT_CONTEXT_ROOT}/threads/index.json`),
    ).toBe(true);
    expect(
      bundle.files.some(
        (file) => file.relativePath === `${T3TEAM_PROJECT_CONTEXT_ROOT}/github/activity/index.json`,
      ),
    ).toBe(true);
    expect(
      bundle.files.some(
        (file) => file.relativePath === `${T3TEAM_PROJECT_CONTEXT_ROOT}/ui/visible-state.json`,
      ),
    ).toBe(true);
  });
});
