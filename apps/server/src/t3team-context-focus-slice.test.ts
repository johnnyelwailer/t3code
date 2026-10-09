import { describe, expect, it } from "vite-plus/test";
import {
  buildJiraTicketAttachmentsIndexPath,
  buildJiraTicketEntryPoint,
  buildJiraTicketFocusEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";

import {
  buildT3TeamWorkItemFocusSliceFile,
  resolveT3TeamFocusSliceAttachmentIndexPath,
} from "./t3team-context-focus-slice.ts";

const ENTRY_POINT = buildJiraTicketEntryPoint("project-alpha", "PROJ-7");
const ATTACHMENT_INDEX = buildJiraTicketAttachmentsIndexPath("project-alpha", "PROJ-7");

describe("buildT3TeamWorkItemFocusSliceFile", () => {
  it("writes a focus entrypoint under items/<key>/focus/<slice>.json", () => {
    const file = buildT3TeamWorkItemFocusSliceFile({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath: ENTRY_POINT,
    });

    expect(file.relativePath).toBe(
      buildJiraTicketFocusEntryPoint({
        projectId: "project-alpha",
        ticketKey: "PROJ-7",
        focus: "jira-ticket-comments",
      }),
    );
    expect(JSON.parse(file.contents)).toMatchObject({
      kind: "jira-ticket-comments",
      label: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      ticketEntryPointRelativePath: ENTRY_POINT,
    });
  });

  it("includes attachment index paths for attachment slices", () => {
    const file = buildT3TeamWorkItemFocusSliceFile({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-attachments",
      label: "Attachments",
      summaryItems: [{ label: "Count", value: "2" }],
      ticketEntryPointRelativePath: ENTRY_POINT,
      attachmentIndexRelativePath: ATTACHMENT_INDEX,
    });

    expect(JSON.parse(file.contents)).toMatchObject({
      attachmentIndexRelativePath: ATTACHMENT_INDEX,
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
    ).toBe(ATTACHMENT_INDEX);
    expect(
      resolveT3TeamFocusSliceAttachmentIndexPath({
        projectId: "project-alpha",
        ticketKey: "PROJ-7",
        focusKind: "jira-ticket-comments",
      }),
    ).toBeUndefined();
  });
});
