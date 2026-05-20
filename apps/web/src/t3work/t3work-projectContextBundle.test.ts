import { describe, expect, it } from "vitest";
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
});
