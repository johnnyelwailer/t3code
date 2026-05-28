import { beforeEach, describe, expect, it, vi } from "vitest";

const backendHarness = vi.hoisted(() => ({
  writeContextFiles: vi.fn(),
}));

import type { AddToChatPayloadInput } from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { syncContextAttachmentFromRequest } from "~/t3work/t3work-contextAttachmentSync";
import { createContextAttachmentRequest } from "~/t3work/t3work-contextAttachmentSync.testHelpers";

beforeEach(() => {
  backendHarness.writeContextFiles.mockReset();
  backendHarness.writeContextFiles.mockResolvedValue({
    workspaceRoot: "/tmp/project-alpha",
    writtenFiles: [],
  });
});

function createBackend(): BackendApi {
  return {
    projectWorkspace: {
      discoverRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      writeContextFiles: backendHarness.writeContextFiles,
    },
  } as unknown as BackendApi;
}

describe("syncContextAttachmentFromRequest", () => {
  it("writes fallback snapshot files for non-bundle payloads", async () => {
    const attachment = await syncContextAttachmentFromRequest({
      attachmentId: "attachment-fallback",
      request: createContextAttachmentRequest(),
      backend: createBackend(),
    });

    expect(backendHarness.writeContextFiles).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      files: [
        {
          relativePath:
            ".t3work/context/misc/project-alpha/project-alpha-proj-7-work-item/entrypoint.json",
          contents: '{\n  "ok": true\n}',
        },
      ],
    });
    expect(attachment).toMatchObject({
      id: "attachment-fallback",
      syncStatus: "synced",
      kind: "jira-work-item",
    });
    expect(attachment.contextText).toContain(
      ".t3work/context/misc/project-alpha/project-alpha-proj-7-work-item/entrypoint.json",
    );
  });

  it("emits sync progress updates while persisting payloads", async () => {
    const updates: string[] = [];

    await syncContextAttachmentFromRequest({
      attachmentId: "attachment-progress",
      request: createContextAttachmentRequest(),
      backend: createBackend(),
      onUpdate: (attachment) => {
        updates.push(
          [
            attachment.syncStatus,
            attachment.syncPhase,
            typeof attachment.syncProgressCurrent === "number"
              ? `${attachment.syncProgressCurrent}/${attachment.syncProgressTotal}`
              : undefined,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      },
    });

    expect(updates).toEqual([
      "syncing | Preparing context data | 0/1",
      "syncing | Saving cached context file | 0/1",
      "syncing | Saving cached context file | 1/1",
      "synced",
    ]);
  });

  it("forwards structured payload progress details into attachment updates", async () => {
    const updates: Array<{
      phase?: string;
      currentItem?: string;
      bytesCurrent?: number;
      items?: ReadonlyArray<string>;
    }> = [];

    await syncContextAttachmentFromRequest({
      attachmentId: "attachment-structured-progress",
      request: createContextAttachmentRequest({
        payload: async (input?: AddToChatPayloadInput) => {
          input?.reportProgress?.({
            phase: "Fetching related Jira snapshots",
            progressCurrent: 1,
            progressTotal: 3,
            syncInfo: {
              contentLabel: "Jira work item context",
              currentItemLabel: "PROJ-8",
              currentItemDetail: "Follow up",
              bytesCurrent: 2048,
              items: [
                { id: "PROJ-7", label: "PROJ-7", status: "completed" },
                { id: "PROJ-8", label: "PROJ-8", status: "active" },
                { id: "PROJ-9", label: "PROJ-9", status: "pending" },
              ],
            },
          });
          return { ok: true };
        },
      }),
      backend: createBackend(),
      onUpdate: (attachment) => {
        updates.push({
          ...(attachment.syncPhase ? { phase: attachment.syncPhase } : {}),
          ...(attachment.syncInfo?.currentItemLabel
            ? { currentItem: attachment.syncInfo.currentItemLabel }
            : {}),
          ...(typeof attachment.syncInfo?.bytesCurrent === "number"
            ? { bytesCurrent: attachment.syncInfo.bytesCurrent }
            : {}),
          ...(attachment.syncInfo?.items
            ? {
                items: attachment.syncInfo.items.map((item) => `${item.label}:${item.status}`),
              }
            : {}),
        });
      },
    });

    expect(updates).toContainEqual({
      phase: "Fetching related Jira snapshots",
      currentItem: "PROJ-8",
      bytesCurrent: 2048,
      items: ["PROJ-7:completed", "PROJ-8:active", "PROJ-9:pending"],
    });
  });
});
