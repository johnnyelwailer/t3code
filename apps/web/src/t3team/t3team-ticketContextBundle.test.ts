import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildJiraTicketFocusEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";

const ticketGraphHarness = vi.hoisted(() => ({
  buildTicketContextGraph: vi.fn(),
}));

vi.mock("~/t3team/t3team-ticketContextGraph", () => ({
  buildTicketContextGraph: ticketGraphHarness.buildTicketContextGraph,
}));

import { buildTicketContextBundle } from "~/t3team/t3team-ticketContextBundle";
import {
  BACKEND,
  GITHUB_ACTIVITY,
  PROJECT,
  ROOT_TICKET,
  createGraph,
} from "~/t3team/t3team-ticketContextBundle.testHelpers";

beforeEach(() => {
  ticketGraphHarness.buildTicketContextGraph.mockReset();
});

const ROOT_ENTRY = buildJiraTicketEntryPoint("Project Alpha", "PROJ-7");
const CHILD_ENTRY = buildJiraTicketEntryPoint("Project Alpha", "PROJ-8");
const REFERENCE_ENTRY = buildJiraTicketEntryPoint("Project Alpha", "PROJ-9");
const GITHUB_ACTIVITY_INDEX = `${buildJiraTicketCacheRoot("Project Alpha", "PROJ-7")}/github-activity/index.json`;
const FOCUS_FILE = buildJiraTicketFocusEntryPoint({
  projectId: "Project Alpha",
  ticketKey: "PROJ-7",
  focus: "jira-ticket-comments",
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
        relativePath: ROOT_ENTRY,
      },
    ]);

    const rootEntryPoint = bundle.files.find((file) => file.relativePath === ROOT_ENTRY);
    expect(JSON.parse(rootEntryPoint?.contents ?? "{}")).toMatchObject({
      kind: "jira-work-item",
      key: "PROJ-7",
      paths: {
        githubActivity: GITHUB_ACTIVITY_INDEX,
      },
      directLinks: [
        {
          relation: "child",
          key: "PROJ-8",
          entryPointRelativePath: CHILD_ENTRY,
        },
        {
          relation: "reference",
          key: "PROJ-9",
          entryPointRelativePath: REFERENCE_ENTRY,
        },
      ],
    });

    const childEntryPoint = bundle.files.find((file) => file.relativePath === CHILD_ENTRY);
    expect(JSON.parse(childEntryPoint?.contents ?? "{}")).toMatchObject({
      key: "PROJ-8",
      directLinks: [
        {
          relation: "parent",
          key: "PROJ-7",
          entryPointRelativePath: ROOT_ENTRY,
        },
      ],
    });

    expect(bundle.files.some((file) => file.relativePath === GITHUB_ACTIVITY_INDEX)).toBe(true);
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
        relativePath: FOCUS_FILE,
      },
      {
        label: "Ticket entrypoint",
        relativePath: ROOT_ENTRY,
      },
    ]);

    const focusFile = bundle.files.find((file) => file.relativePath === FOCUS_FILE);
    expect(JSON.parse(focusFile?.contents ?? "{}")).toMatchObject({
      kind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath: ROOT_ENTRY,
    });
  });
});
