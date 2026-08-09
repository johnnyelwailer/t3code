/**
 * The pure half of recording a verdict. The round trip through the real engine + projection lives in
 * `t3team-draftMutationStatusRoundTrip.integration.test.ts`; these pin the rules that decide WHAT is
 * written, because each of them is a way to silently damage a carrier.
 */

import { T3TeamMessageExt } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  carrierMessageIdFromDraftId,
  withDraftMutationStatus,
} from "./t3team-draftMutationStatus.ts";

const decodeExt = Schema.decodeUnknownSync(T3TeamMessageExt);

const carrierExt = (): T3TeamMessageExt =>
  decodeExt({
    author: { kind: "system" },
    visibleToUser: false,
    visibleToAgent: false,
    attachments: [
      {
        kind: "draft-mutation",
        draft: {
          id: "jira-draft:carrier-1",
          kind: "jira-work-item-draft",
          tool: "t3team.work_item.description.draft_update",
          target: { provider: "jira", issueIdOrKey: "NXAI-6" },
          field: "description",
          patch: { description: "## Goal\nRound to two decimals." },
          status: "draft",
          summary: "Rewrote the description",
          commitPolicy: { requiresUserApproval: true, commitSurface: "work-item" },
        },
      },
    ],
  });

describe("carrierMessageIdFromDraftId", () => {
  it("addresses the same carrier from a draft id or a bare message id", () => {
    expect(carrierMessageIdFromDraftId("jira-draft:carrier-1")).toBe("carrier-1");
    expect(carrierMessageIdFromDraftId("  carrier-1 ")).toBe("carrier-1");
  });

  it("refuses what cannot address a carrier", () => {
    expect(carrierMessageIdFromDraftId("")).toBeUndefined();
    expect(carrierMessageIdFromDraftId("   ")).toBeUndefined();
    expect(carrierMessageIdFromDraftId("jira-draft:")).toBeUndefined();
  });
});

describe("withDraftMutationStatus", () => {
  it("records the verdict and preserves everything that keeps the carrier hidden", () => {
    const updated = withDraftMutationStatus(carrierExt(), "applied");
    const attachment = updated?.attachments?.[0];

    expect(attachment?.kind === "draft-mutation" ? attachment.draft.status : undefined).toBe(
      "applied",
    );
    // The carrier must stay invisible: surfacing it would put an empty message in the chat.
    expect(updated?.visibleToUser).toBe(false);
    expect(updated?.visibleToAgent).toBe(false);
    expect(updated?.author).toEqual({ kind: "system" });
    // A verdict never rewrites the proposal it settles.
    const draft = attachment?.kind === "draft-mutation" ? attachment.draft : undefined;
    expect(draft?.kind === "jira-work-item-draft" ? draft.patch : undefined).toEqual({
      description: "## Goal\nRound to two decimals.",
    });
    expect(decodeExt(updated)).toEqual(updated);
  });

  it("carries a dismissal the same way", () => {
    const updated = withDraftMutationStatus(carrierExt(), "dismissed");
    const attachment = updated?.attachments?.[0];
    expect(attachment?.kind === "draft-mutation" ? attachment.draft.status : undefined).toBe(
      "dismissed",
    );
  });

  it("leaves non-draft attachments on the message untouched", () => {
    const ext = decodeExt({
      ...carrierExt(),
      attachments: [
        { kind: "artifact", artifact: { kind: "report", label: "Run log" } },
        ...(carrierExt().attachments ?? []),
      ],
    });
    const updated = withDraftMutationStatus(ext, "applied");
    expect(updated?.attachments?.[0]).toEqual({
      kind: "artifact",
      artifact: { kind: "report", label: "Run log" },
    });
    const draft = updated?.attachments?.[1];
    expect(draft?.kind === "draft-mutation" ? draft.draft.status : undefined).toBe("applied");
  });

  it("reports a message that carries no draft instead of upserting a no-op", () => {
    expect(withDraftMutationStatus(undefined, "applied")).toBeUndefined();
    expect(withDraftMutationStatus({ visibleToUser: false }, "applied")).toBeUndefined();
    expect(
      withDraftMutationStatus(
        decodeExt({ attachments: [{ kind: "artifact", artifact: { kind: "r", label: "l" } }] }),
        "applied",
      ),
    ).toBeUndefined();
  });
});
