import { describe, expect, it } from "vite-plus/test";

import {
  buildT3TeamWorkItemFocusSliceFile,
  resolveT3TeamFocusSliceAttachmentIndexPath,
} from "./t3team-context-focus-slice.ts";

describe("buildT3TeamWorkItemFocusSliceFile", () => {
  it("writes a focus entrypoint under items/<key>/focus/<slice>.json", () => {
    const file = buildT3TeamWorkItemFocusSliceFile({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath:
        ".t3team/context/jira/project-alpha/items/proj-7/entrypoint.json",
    });

    expect(file.relativePath).toBe(
      ".t3team/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
    );
    expect(JSON.parse(file.contents)).toMatchObject({
      kind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath:
        ".t3team/context/jira/project-alpha/items/proj-7/entrypoint.json",
    });
  });

  it("includes attachment index paths for attachment slices", () => {
    const file = buildT3TeamWorkItemFocusSliceFile({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-attachments",
      label: "Attachments",
      summaryItems: [{ label: "Count", value: "2" }],
      ticketEntryPointRelativePath:
        ".t3team/context/jira/project-alpha/items/proj-7/entrypoint.json",
      attachmentIndexRelativePath:
        ".t3team/context/jira/project-alpha/items/proj-7/attachments/index.json",
    });

    expect(JSON.parse(file.contents)).toMatchObject({
      attachmentIndexRelativePath:
        ".t3team/context/jira/project-alpha/items/proj-7/attachments/index.json",
    });
  });
});

describe("resolveT3TeamFocusSliceAttachmentIndexPath", () => {
  it("returns attachment index paths only for attachment slices", () => {
    expect(
      resolveT3TeamFocusSliceAttachmentIndexPath({
        projectId: "project-alpha",
        ticketKey: "PROJ-7",
        focusKind: "jira-ticket-attachments",
      }),
    ).toBe(".t3team/context/jira/project-alpha/items/proj-7/attachments/index.json");
    expect(
      resolveT3TeamFocusSliceAttachmentIndexPath({
        projectId: "project-alpha",
        ticketKey: "PROJ-7",
        focusKind: "jira-ticket-comments",
      }),
    ).toBeUndefined();
  });
});
