import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketGraphHarness = vi.hoisted(() => ({
  buildTicketContextGraph: vi.fn(),
}));

vi.mock("~/t3work/t3work-ticketContextGraph", () => ({
  buildTicketContextGraph: ticketGraphHarness.buildTicketContextGraph,
}));

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import {
  PROJECT,
  ROOT_TICKET,
  createSnapshotWithFields,
} from "~/t3work/t3work-ticketContextBundle.testHelpers";

beforeEach(() => {
  ticketGraphHarness.buildTicketContextGraph.mockReset();
});

describe("buildTicketContextBundle attachments", () => {
  it("downloads Jira attachment assets into the ticket bundle and references a local index", async () => {
    ticketGraphHarness.buildTicketContextGraph.mockResolvedValue({
      rootKey: "PROJ-7",
      nodes: new Map([
        [
          "PROJ-7",
          {
            key: "PROJ-7",
            ticket: ROOT_TICKET,
            snapshot: createSnapshotWithFields("PROJ-7", ROOT_TICKET.ref.title, {
              attachments: [
                {
                  id: "att-1",
                  filename: "Screenshot 1.png",
                  mimeType: "image/png",
                  content: "https://example.test/secure/attachment/10000/Screenshot%201.png",
                  size: 4,
                },
              ],
            }),
            relationshipKeys: {
              childKeys: [],
              referenceKeys: [],
            },
          },
        ],
      ]),
    });

    const downloadAsset = vi.fn(async () => ({
      base64Contents: "AQIDBA==",
      mimeType: "image/png",
      sizeBytes: 4,
    }));

    const bundle = await buildTicketContextBundle({
      backend: {
        atlassian: {
          downloadAsset,
        },
      } as unknown as BackendApi,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET],
      githubActivityItems: [],
    });

    expect(downloadAsset).toHaveBeenCalledWith({
      accountId: "acct-1",
      url: "https://example.test/secure/attachment/10000/Screenshot%201.png",
    });
    expect(bundle.fileReferences).toContainEqual({
      label: "Attachment index",
      relativePath: ".t3work/context/jira/project-alpha/items/proj-7/attachments/index.json",
    });

    const entryPoint = bundle.files.find(
      (file) =>
        file.relativePath === ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
    );
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      paths: {
        attachments: ".t3work/context/jira/project-alpha/items/proj-7/attachments/index.json",
      },
      attachmentSummary: {
        count: 1,
        failedCount: 0,
      },
    });

    const attachmentIndex = bundle.files.find(
      (file) =>
        file.relativePath ===
        ".t3work/context/jira/project-alpha/items/proj-7/attachments/index.json",
    );
    expect(JSON.parse(attachmentIndex?.contents ?? "{}")).toMatchObject({
      attachmentCount: 1,
      downloadedCount: 1,
      failedCount: 0,
      attachments: [
        {
          id: "att-1",
          filename: "screenshot-1.png",
          mimeType: "image/png",
          localPath:
            ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/att-1-screenshot-1.png",
          status: "downloaded",
        },
      ],
    });

    expect(bundle.files).toContainEqual({
      relativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/att-1-screenshot-1.png",
      contents: "AQIDBA==",
      encoding: "base64",
      sizeBytes: 4,
    });
  });
});
