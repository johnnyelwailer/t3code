/**
 * The opt-in rule for a completion card. Its edges matter more than its happy path: a card that
 * points at nothing is worse than prose, so every branch that cannot produce a NAVIGABLE ref must
 * return undefined rather than a half-filled one.
 */

import { T3TeamMessageWorkItemDraftRefAttachment } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { workflowCompletionDraftRef } from "./t3team-workflowCompletionDraftRef.ts";

const decode = Schema.decodeUnknownSync(T3TeamMessageWorkItemDraftRefAttachment);

describe("workflowCompletionDraftRef", () => {
  it("builds a contract-valid ref from the opt-in pair, with the preview when present", () => {
    const ref = workflowCompletionDraftRef(
      { issueIdOrKey: "NXAI-6", proposed: true, field: "description", summary: "Rewrote it." },
      "project-1",
    );
    expect(ref).toEqual({
      kind: "work-item-draft",
      projectId: "project-1",
      issueIdOrKey: "NXAI-6",
      field: "description",
      summary: "Rewrote it.",
    });
    // Decodes against the contract, so the message it rides on survives the projection.
    expect(decode(ref)).toEqual(ref);
  });

  it("works on the bare opt-in pair — a body owes no summary", () => {
    const ref = workflowCompletionDraftRef({ issueIdOrKey: "NXAI-6", proposed: true }, "project-1");
    expect(ref).toEqual({
      kind: "work-item-draft",
      projectId: "project-1",
      issueIdOrKey: "NXAI-6",
    });
    expect(decode(ref)).toEqual(ref);
  });

  it("drops a field name that is not part of the draft vocabulary", () => {
    const ref = workflowCompletionDraftRef(
      { issueIdOrKey: "NXAI-6", proposed: true, field: "epic-colour" },
      "project-1",
    );
    expect(ref?.field).toBeUndefined();
    expect(decode(ref)).toEqual(ref);
  });

  it.each([
    ["a run that proposed nothing", { issueIdOrKey: "NXAI-6", proposed: false }, "project-1"],
    ["output with no issue key", { proposed: true, summary: "done" }, "project-1"],
    ["a blank issue key", { issueIdOrKey: "   ", proposed: true }, "project-1"],
    ["a run with no project to navigate to", { issueIdOrKey: "NXAI-6", proposed: true }, undefined],
    ["a string output", "Workflow completed.", "project-1"],
    ["an array output", [1, 2, 3], "project-1"],
    ["no output at all", undefined, "project-1"],
  ] as ReadonlyArray<readonly [string, unknown, string | undefined]>)(
    "returns no ref for %s",
    (_label, output, projectId) => {
      expect(workflowCompletionDraftRef(output, projectId)).toBeUndefined();
    },
  );
});
