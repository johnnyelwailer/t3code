import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { buildProjectContextBundle } from "~/t3work/t3work-projectContextBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";

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

    expect(bundle.bundleRootRelativePath).toBe(".t3work/context");
    expect(bundle.fileReferences).toEqual([
      {
        label: "Project entrypoint",
        relativePath: ".t3work/context/entrypoint.json",
      },
    ]);

    const entryPoint = bundle.files.find(
      (file) => file.relativePath === ".t3work/context/entrypoint.json",
    );
    expect(entryPoint).toBeDefined();
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      kind: "project",
      paths: {
        workItemsIndex: ".t3work/context/work-items/index.json",
      },
    });

    const workItemsIndex = bundle.files.find(
      (file) => file.relativePath === ".t3work/context/work-items/index.json",
    );
    expect(JSON.parse(workItemsIndex?.contents ?? "{}")).toMatchObject({
      workItems: [
        {
          key: "PROJ-1",
          availability: "summary",
          loadableOnDemand: true,
          ticketEntryPointRelativePath:
            ".t3work/context/jira/project-alpha/items/proj-1/entrypoint.json",
        },
        {
          key: "PROJ-2",
          ticketEntryPointRelativePath:
            ".t3work/context/jira/project-alpha/items/proj-2/entrypoint.json",
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
      bundle.files.some((file) => file.relativePath === ".t3work/context/work-items/index.json"),
    ).toBe(false);
    expect(
      JSON.parse(
        bundle.files.find((file) => file.relativePath === ".t3work/context/entrypoint.json")
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
            messageCount: 2,
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
      bundle.files.some((file) => file.relativePath === ".t3work/context/threads/index.json"),
    ).toBe(true);
    expect(
      bundle.files.some(
        (file) => file.relativePath === ".t3work/context/github/activity/index.json",
      ),
    ).toBe(true);
    expect(
      bundle.files.some((file) => file.relativePath === ".t3work/context/ui/visible-state.json"),
    ).toBe(true);
  });
});
