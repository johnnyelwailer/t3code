import { describe, expect, it } from "vite-plus/test";

import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3team/t3team-contextAttachmentMerge";

function createAttachment(
  id: string,
  overrides?: Partial<T3TeamContextAttachment>,
): T3TeamContextAttachment {
  return {
    id,
    kind: "jira-work-item",
    label: `Attachment ${id}`,
    contextText: `Context ${id}`,
    ...overrides,
  };
}

describe("mergeContextAttachmentsById", () => {
  it("replaces existing attachments by id and appends new ones", () => {
    const result = mergeContextAttachmentsById({
      current: [createAttachment("att-1", { syncStatus: "syncing" }), createAttachment("att-2")],
      incoming: [
        createAttachment("att-1", { syncStatus: "synced", syncedAt: "2026-05-18T12:34:56Z" }),
        createAttachment("att-3"),
      ],
    });

    expect(result).toEqual([
      createAttachment("att-1", { syncStatus: "synced", syncedAt: "2026-05-18T12:34:56Z" }),
      createAttachment("att-2"),
      createAttachment("att-3"),
    ]);
  });

  it("skips dismissed ids for both replacement and append paths", () => {
    const result = mergeContextAttachmentsById({
      current: [createAttachment("att-1"), createAttachment("att-2")],
      incoming: [
        createAttachment("att-1", { syncStatus: "error", syncError: "failed" }),
        createAttachment("att-3"),
      ],
      dismissedIds: new Set(["att-1", "att-3"]),
    });

    expect(result).toEqual([createAttachment("att-2")]);
  });
});
