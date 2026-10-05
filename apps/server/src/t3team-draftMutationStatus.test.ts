/**
 * The pure half of recording a verdict. The round trip through the real store and route lives in
 * `t3team-draftMutationStatusRoundTrip.integration.test.ts`; these pin the rules that decide WHAT is
 * written, because each of them is a way to silently damage a proposal.
 */

import { T3TeamMessageDraftMutationAttachment } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  draftArtifactIdFromDraftId,
  withDraftMutationStatus,
} from "./t3team-draftMutationStatus.ts";

const decodeAttachment = Schema.decodeUnknownSync(T3TeamMessageDraftMutationAttachment);

const draftPayload = () =>
  decodeAttachment({
    kind: "draft-mutation",
    draft: {
      id: "jira-draft:draft-1",
      kind: "jira-work-item-draft",
      tool: "t3team.work_item.description.draft_update",
      target: { provider: "jira", issueIdOrKey: "PROJ-6" },
      field: "description",
      patch: { description: "## Goal\nRound to two decimals." },
      status: "draft",
      summary: "Rewrote the description",
      commitPolicy: { requiresUserApproval: true, commitSurface: "work-item" },
    },
  });

describe("draftArtifactIdFromDraftId", () => {
  it("addresses the same artifact from a draft id or the bare id", () => {
    expect(draftArtifactIdFromDraftId("jira-draft:draft-1")).toBe("jira-draft:draft-1");
    expect(draftArtifactIdFromDraftId("  draft-1 ")).toBe("jira-draft:draft-1");
  });

  it("refuses what cannot address a draft", () => {
    expect(draftArtifactIdFromDraftId("")).toBeUndefined();
    expect(draftArtifactIdFromDraftId("   ")).toBeUndefined();
    expect(draftArtifactIdFromDraftId("jira-draft:")).toBeUndefined();
  });
});

describe("withDraftMutationStatus", () => {
  it("records the verdict and never rewrites the proposal", () => {
    const updated = withDraftMutationStatus(draftPayload(), "applied");
    expect(updated?.draft.status).toBe("applied");
    expect(updated?.draft.id).toBe("jira-draft:draft-1");
    expect(updated?.draft.patch).toEqual({ description: "## Goal\nRound to two decimals." });
    expect(decodeAttachment(updated)).toEqual(updated);
  });

  it("carries a dismissal the same way", () => {
    expect(withDraftMutationStatus(draftPayload(), "dismissed")?.draft.status).toBe("dismissed");
  });

  it("reports a payload that carries no draft instead of writing a no-op", () => {
    expect(withDraftMutationStatus(undefined, "applied")).toBeUndefined();
    expect(withDraftMutationStatus({ kind: "widget", widget: {} }, "applied")).toBeUndefined();
    expect(withDraftMutationStatus({ kind: "draft-mutation" }, "applied")).toBeUndefined();
  });
});
