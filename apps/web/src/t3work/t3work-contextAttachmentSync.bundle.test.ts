/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const backendHarness = vi.hoisted(() => ({
  writeContextFiles: vi.fn(),
}));

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  forgetContextAttachmentRequest,
  syncContextAttachmentFromRequest,
} from "~/t3work/t3work-contextAttachmentSync";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import {
  createContextAttachmentRequest,
  createDeferred,
  ENVIRONMENT_ID,
} from "~/t3work/t3work-contextAttachmentSync.testHelpers";

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
      refreshWorkItemContext: vi.fn(async (input) => ({
        ok: true,
        status: "synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        availability: "full" as const,
        entryPointRelativePath: `.t3work/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        manifestRelativePath: `.t3work/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/manifest.json`,
        includedCount: 1,
        skippedCount: 0,
      })),
      refreshWorkItemSliceContext: vi.fn(async (input) => ({
        ok: true,
        status: "synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        focusKind: input.focusKind,
        availability: "full" as const,
        focusEntryPointRelativePath: `.t3work/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/focus/${input.focusKind}.json`,
        entryPointRelativePath: `.t3work/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        includedCount: 1,
        skippedCount: 0,
      })),
    },
  } as unknown as BackendApi;
}

describe("syncContextAttachmentFromRequest directory bundles", () => {
  it("persists all directory bundle files and carries bundle references into the attachment", async () => {
    const payload: T3WorkDirectoryBundlePayload = {
      kind: "t3work-directory-bundle",
      dedupeKey: "project-alpha:PROJ-7:work-item",
      bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
      files: [
        {
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
          contents: '{"kind":"jira-work-item"}',
        },
        {
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/manifest.json",
          contents: '{"kind":"jira-work-item-context-manifest"}',
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

    const attachment = await syncContextAttachmentFromRequest({
      attachmentId: "attachment-bundle",
      request: createContextAttachmentRequest({ payload }),
      backend: createBackend(),
    });

    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(2);
    expect(backendHarness.writeContextFiles).toHaveBeenNthCalledWith(1, {
      workspaceRoot: "/tmp/project-alpha",
      files: [
        {
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
          contents: '{"kind":"jira-work-item"}',
        },
      ],
    });
    expect(attachment.fileReferences).toEqual(payload.fileReferences);
    expect(attachment.contextText).toContain(payload.bundleRootRelativePath);
  });

  it("forwards base64 directory bundle files to workspace writes with binary encoding", async () => {
    const payload: T3WorkDirectoryBundlePayload = {
      kind: "t3work-directory-bundle",
      dedupeKey: "project-alpha:PROJ-7:attachments",
      bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
      files: [
        {
          relativePath:
            ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/att-1-example.png",
          contents: "AQIDBA==",
          encoding: "base64",
          sizeBytes: 4,
        },
      ],
      fileReferences: [
        {
          label: "Attachment index",
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/attachments/index.json",
        },
      ],
      lightweightItem: { kind: "jira-ticket-attachments", label: "Attachments" },
    };

    await syncContextAttachmentFromRequest({
      attachmentId: "attachment-binary-bundle",
      request: createContextAttachmentRequest({ payload }),
      backend: createBackend(),
    });

    expect(backendHarness.writeContextFiles).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      files: [
        {
          relativePath:
            ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/att-1-example.png",
          contents: "AQIDBA==",
          encoding: "base64",
        },
      ],
    });
  });

  it("dedupes concurrent sync work for the same attachment id while the first sync is in flight", async () => {
    const gate = createDeferred<void>();
    const payload = vi.fn(async () => {
      await gate.promise;
      return { ok: true };
    });
    const request = createContextAttachmentRequest({ payload });

    const first = syncContextAttachmentFromRequest({
      attachmentId: "attachment-concurrent",
      request,
      backend: createBackend(),
    });
    const second = syncContextAttachmentFromRequest({
      attachmentId: "attachment-concurrent",
      request,
      backend: createBackend(),
    });

    await Promise.resolve();
    expect(payload).toHaveBeenCalledTimes(1);

    gate.resolve();
    const [firstAttachment, secondAttachment] = await Promise.all([first, second]);

    expect(payload).toHaveBeenCalledTimes(1);
    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(1);
    expect(firstAttachment.contextText).toBe(secondAttachment.contextText);

    forgetContextAttachmentRequest("attachment-concurrent");
  });

  it("skips workspace file writes for server-owned directory bundles", async () => {
    const payload: T3WorkDirectoryBundlePayload = {
      kind: "t3work-directory-bundle",
      dedupeKey: "project-alpha:PROJ-7:work-item",
      bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
      files: [],
      fileReferences: [
        {
          label: "Ticket entrypoint",
          relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
        },
      ],
      lightweightItem: { kind: "jira-work-item", label: "PROJ-7 Investigate context sync" },
    };

    const attachment = await syncContextAttachmentFromRequest({
      attachmentId: "attachment-server-owned",
      request: createContextAttachmentRequest({ payload }),
      backend: createBackend(),
    });

    expect(backendHarness.writeContextFiles).not.toHaveBeenCalled();
    expect(attachment.fileReferences).toEqual(payload.fileReferences);
    expect(attachment.syncStatus).toBe("synced");
  });
});
