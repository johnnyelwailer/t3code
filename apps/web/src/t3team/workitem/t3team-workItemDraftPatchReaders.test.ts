import { describe, expect, it } from "vite-plus/test";
import { readLinkDraftPatch, readSubtaskDraftPatch } from "./t3team-workItemDraftPatchReaders";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";

function linkDraft(patch: Record<string, unknown>): T3TeamScalarDraftMutation {
  return {
    id: "l1",
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
    field: "link",
    status: "draft",
    patch,
  };
}

function subtaskDraft(patch: Record<string, unknown>): T3TeamScalarDraftMutation {
  return { ...linkDraft(patch), field: "subtask" };
}

describe("readLinkDraftPatch", () => {
  it("reads a create-link patch", () => {
    const patch = readLinkDraftPatch(
      linkDraft({ action: "create", otherIssueIdOrKey: "ALPHA-2", linkTypeName: "Blocks", direction: "outward" }),
    );
    expect(patch).toEqual({
      action: "create",
      otherIssueIdOrKey: "ALPHA-2",
      linkTypeName: "Blocks",
      direction: "outward",
    });
  });

  it("reads a remove-link patch", () => {
    expect(readLinkDraftPatch(linkDraft({ action: "remove", linkId: "10001" }))).toEqual({
      action: "remove",
      linkId: "10001",
    });
  });

  it("is undefined when the create patch is missing a required field", () => {
    expect(readLinkDraftPatch(linkDraft({ action: "create", otherIssueIdOrKey: "ALPHA-2" }))).toBeUndefined();
  });

  it("is undefined for an unrecognized direction", () => {
    expect(
      readLinkDraftPatch(
        linkDraft({ action: "create", otherIssueIdOrKey: "ALPHA-2", linkTypeName: "Blocks", direction: "sideways" }),
      ),
    ).toBeUndefined();
  });
});

describe("readSubtaskDraftPatch", () => {
  it("reads a minimal subtask patch", () => {
    expect(readSubtaskDraftPatch(subtaskDraft({ summary: "Write the migration" }))).toEqual({
      summary: "Write the migration",
    });
  });

  it("carries optional description and estimateHours when present", () => {
    expect(
      readSubtaskDraftPatch(
        subtaskDraft({ summary: "Write the migration", description: "See RFC-9", estimateHours: 2 }),
      ),
    ).toEqual({ summary: "Write the migration", description: "See RFC-9", estimateHours: 2 });
  });

  it("is undefined without a summary", () => {
    expect(readSubtaskDraftPatch(subtaskDraft({ description: "no summary" }))).toBeUndefined();
  });
});
