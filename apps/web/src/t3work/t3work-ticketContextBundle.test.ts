import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketGraphHarness = vi.hoisted(() => ({
  buildTicketContextGraph: vi.fn(),
}));

vi.mock("~/t3work/t3work-ticketContextGraph", () => ({
  buildTicketContextGraph: ticketGraphHarness.buildTicketContextGraph,
}));

import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import {
  BACKEND,
  GITHUB_ACTIVITY,
  PROJECT,
  ROOT_TICKET,
  createGraph,
} from "~/t3work/t3work-ticketContextBundle.testHelpers";

beforeEach(() => {
  ticketGraphHarness.buildTicketContextGraph.mockReset();
});

describe("buildTicketContextBundle", () => {
  it("projects recursive graph nodes into stable ticket bundle files", async () => {
    ticketGraphHarness.buildTicketContextGraph.mockResolvedValue(createGraph());

    const bundle = await buildTicketContextBundle({
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET],
      githubActivityItems: GITHUB_ACTIVITY,
    });

    expect(bundle.dedupeKey).toBe("Project Alpha:PROJ-7:work-item");
    expect(bundle.fileReferences).toEqual([
      {
        label: "Ticket entrypoint",
        relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      },
    ]);

    const rootEntryPoint = bundle.files.find(
      (file) =>
        file.relativePath === ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
    );
    expect(JSON.parse(rootEntryPoint?.contents ?? "{}")).toMatchObject({
      kind: "jira-work-item",
      key: "PROJ-7",
      paths: {
        githubActivity:
          ".t3work/context/jira/project-alpha/items/proj-7/github-activity/index.json",
      },
      directLinks: [
        {
          relation: "child",
          key: "PROJ-8",
          entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-8/entrypoint.json",
        },
        {
          relation: "reference",
          key: "PROJ-9",
          entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-9/entrypoint.json",
        },
      ],
    });

    const childEntryPoint = bundle.files.find(
      (file) =>
        file.relativePath === ".t3work/context/jira/project-alpha/items/proj-8/entrypoint.json",
    );
    expect(JSON.parse(childEntryPoint?.contents ?? "{}")).toMatchObject({
      key: "PROJ-8",
      directLinks: [
        {
          relation: "parent",
          key: "PROJ-7",
          entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
        },
      ],
    });

    expect(
      bundle.files.some(
        (file) =>
          file.relativePath ===
          ".t3work/context/jira/project-alpha/items/proj-7/github-activity/index.json",
      ),
    ).toBe(true);
  });

  it("returns a focused bundle entrypoint when focus metadata is provided", async () => {
    ticketGraphHarness.buildTicketContextGraph.mockResolvedValue(createGraph());

    const bundle = await buildTicketContextBundle({
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET],
      githubActivityItems: [],
      focus: {
        kind: "jira-ticket-comments",
        label: "Comments",
        summaryItems: [{ label: "Count", value: "4" }],
      },
    });

    expect(bundle.dedupeKey).toBe("Project Alpha:PROJ-7:jira-ticket-comments");
    expect(bundle.fileReferences).toEqual([
      {
        label: "Focused context",
        relativePath:
          ".t3work/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
      },
      {
        label: "Ticket entrypoint",
        relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      },
    ]);

    const focusFile = bundle.files.find(
      (file) =>
        file.relativePath ===
        ".t3work/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
    );
    expect(JSON.parse(focusFile?.contents ?? "{}")).toMatchObject({
      kind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
    });
  });
});
