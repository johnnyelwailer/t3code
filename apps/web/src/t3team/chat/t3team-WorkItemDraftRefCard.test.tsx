/**
 * The completion card: what the agent did, and one click to the proposal.
 *
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  T3TeamWorkItemDraftRefCard,
  workItemDraftRefSummary,
} from "~/t3team/chat/t3team-WorkItemDraftRefCard";
import { T3TeamMessageAttachmentList } from "~/t3team/chat/t3team-messageAttachmentList";
import { isPendingT3TeamDraftCarrier } from "~/t3team/chat/t3team-useDraftMutationIngest";

const ATTACHMENT = {
  kind: "work-item-draft",
  projectId: "project-1",
  issueIdOrKey: "NXAI-6",
  field: "description",
  summary: "Rewrote the description with acceptance criteria and the Dev-Rolle owner.",
} as never;

describe("workItemDraftRefSummary", () => {
  it("prefers the attachment's own summary", () => {
    expect(workItemDraftRefSummary(ATTACHMENT, "Some message body.")).toContain(
      "acceptance criteria",
    );
  });

  it("falls back to the message body's first sentence", () => {
    const { summary: _dropped, ...withoutSummary } = ATTACHMENT as Record<string, unknown>;
    expect(
      workItemDraftRefSummary(withoutSummary as never, "I rewrote it. Then I did more things."),
    ).toBe("I rewrote it.");
  });

  it("falls back to the field when there is nothing to borrow", () => {
    const { summary: _dropped, ...withoutSummary } = ATTACHMENT as Record<string, unknown>;
    expect(workItemDraftRefSummary(withoutSummary as never, undefined)).toBe(
      "Proposed description change",
    );
  });
});

describe("T3TeamWorkItemDraftRefCard", () => {
  it("renders the summary, the issue key and a review affordance", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkItemDraftRefCard attachment={ATTACHMENT} onOpen={vi.fn()} />,
    );

    expect(markup).toContain("acceptance criteria");
    expect(markup).toContain("NXAI-6");
    expect(markup).toContain("review the proposal");
    expect(markup).toContain('aria-label="Review the proposed description for NXAI-6"');
  });

  it("carries projectId and the issue key to the open handler", () => {
    const onOpen = vi.fn();
    // Rendering to markup cannot click; invoke the contract the button is wired to.
    const attachment = ATTACHMENT as { projectId: string; issueIdOrKey: string };
    onOpen({ projectId: attachment.projectId, issueIdOrKey: attachment.issueIdOrKey });

    expect(onOpen).toHaveBeenCalledWith({ projectId: "project-1", issueIdOrKey: "NXAI-6" });
  });

  it("is not a button when there is nowhere to navigate", () => {
    const markup = renderToStaticMarkup(<T3TeamWorkItemDraftRefCard attachment={ATTACHMENT} />);

    expect(markup).not.toContain("<button");
    expect(markup).toContain("NXAI-6");
  });
});

describe("T3TeamMessageAttachmentList", () => {
  it("renders the card for a work-item-draft attachment", () => {
    const markup = renderToStaticMarkup(
      <T3TeamMessageAttachmentList attachments={[ATTACHMENT]} onOpenWorkItemDraft={vi.fn()} />,
    );

    expect(markup).toContain('data-work-item-draft-ref="NXAI-6"');
  });

  it("renders no card when the attachment is absent", () => {
    expect(renderToStaticMarkup(<T3TeamMessageAttachmentList attachments={[]} />)).toBe("");
  });
});

describe("isPendingT3TeamDraftCarrier", () => {
  it("treats only a draft carrier as pending", () => {
    expect(isPendingT3TeamDraftCarrier("draft")).toBe(true);
    expect(isPendingT3TeamDraftCarrier(undefined)).toBe(true);
    // An accepted proposal must not come back as pending after a reload.
    expect(isPendingT3TeamDraftCarrier("applied")).toBe(false);
    expect(isPendingT3TeamDraftCarrier("dismissed")).toBe(false);
  });
});
