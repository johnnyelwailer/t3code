import { describe, expect, it } from "vite-plus/test";
import {
  buildJiraTicketAttachmentsIndexPath,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";

import { buildT3TeamWorkItemContextBundle } from "./t3team-context-bundle-builder.ts";

const ATTACHMENT_INDEX = buildJiraTicketAttachmentsIndexPath("project-1", "PROJ-1");
const ENTRY_POINT = buildJiraTicketEntryPoint("project-1", "PROJ-1");

describe("buildT3TeamWorkItemContextBundle", () => {
  it("writes attachment files before full manifest and entrypoint", () => {
    const bundle = buildT3TeamWorkItemContextBundle({
      projectId: "project-1",
      rootKey: "PROJ-1",
      nodes: [
        {
          key: "PROJ-1",
          depth: 0,
          ticket: null,
          snapshot: null,
          relationshipKeys: { childKeys: [], referenceKeys: [] },
        },
      ],
      attachmentFiles: [
        {
          relativePath: ATTACHMENT_INDEX,
          contents: "{}",
        },
      ],
      attachmentIndexes: new Map([
        [
          "PROJ-1",
          {
            indexRelativePath: ATTACHMENT_INDEX,
            attachmentCount: 1,
            downloadedCount: 1,
            failedCount: 0,
          },
        ],
      ]),
    });

    const paths = bundle.files.map((file) => file.relativePath);
    expect(paths.indexOf(ATTACHMENT_INDEX)).toBeLessThan(paths.indexOf(ENTRY_POINT));
    expect(bundle.files.at(-1)?.contents).toContain('"availability": "full"');
  });
});
