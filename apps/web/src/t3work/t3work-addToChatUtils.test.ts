import { describe, expect, it } from "vitest";

import {
  buildContextAttachment,
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3work/t3work-addToChatUtils";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";

function createRequest(): AddToChatRequest {
  return {
    projectId: "project-alpha",
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    targetLabel: "PROJ-7 Investigate context sync",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-alpha:PROJ-7:work-item",
    summaryItems: [{ label: "Status", value: "In Progress" }],
    payload: { ok: true },
  };
}

describe("t3work add-to-chat utils", () => {
  it("builds pending attachments with explicit syncing status", () => {
    const attachment = buildPendingContextAttachment({ request: createRequest(), id: "att-1" });

    expect(attachment).toMatchObject({
      id: "att-1",
      syncStatus: "syncing",
      kind: "jira-work-item",
    });
    expect(attachment.contextText).toContain("- Sync status: syncing");
  });

  it("includes bundle references and synced metadata for synced attachments", () => {
    const payload: T3WorkDirectoryBundlePayload = {
      kind: "t3work-directory-bundle",
      dedupeKey: "project-alpha:PROJ-7:work-item",
      bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
      files: [
        {
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
          contents: '{"kind":"jira-work-item"}',
        },
      ],
      fileReferences: [
        {
          label: "Ticket entrypoint",
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
        },
      ],
      lightweightItem: { kind: "jira-work-item", label: "PROJ-7 Investigate context sync" },
    };

    const attachment = buildContextAttachment({
      id: "att-2",
      request: createRequest(),
      payload,
      syncStatus: "synced",
      syncedAt: "2026-05-18T12:34:56.000Z",
    });

    expect(attachment.fileReferences).toEqual(payload.fileReferences);
    expect(attachment.contextText).toContain(".t3work/context/jira/project-alpha/items/proj-7");
    expect(attachment.contextText).toContain("- Synced at: 2026-05-18T12:34:56.000Z");
  });
});
