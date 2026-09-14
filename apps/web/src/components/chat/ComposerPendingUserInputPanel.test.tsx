import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import type { PendingUserInput } from "../../session-logic";

const prompt: PendingUserInput = {
  requestId: ApprovalRequestId.make("request-1"),
  createdAt: "2026-08-15T00:00:00.000Z",
  questions: [
    {
      id: "question-1",
      header: "Approach",
      question: "Which approach should the migration take?",
      options: [
        { label: "Incremental", description: "Move one module at a time" },
        { label: "Big bang", description: "Move everything in one release" },
      ],
      multiSelect: false,
    },
  ],
};

function renderPanel() {
  return renderToStaticMarkup(
    <ComposerPendingUserInputPanel
      pendingUserInputs={[prompt]}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onAdvance={() => {}}
    />,
  );
}

describe("ComposerPendingUserInputPanel", () => {
  it("renders the header as a disclosure control for the question body", () => {
    const markup = renderPanel();

    const toggle = markup.match(/<button[^>]*data-pending-user-input-toggle="[^"]*"[^>]*>/)?.[0];
    expect(toggle).toBeDefined();
    expect(toggle).toContain('data-pending-user-input-toggle="expanded"');
    expect(toggle).toContain('aria-expanded="true"');
    expect(toggle).toContain('type="button"');

    const controlledId = toggle?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controlledId).toBeDefined();
    expect(markup).toMatch(new RegExp(`<div[^>]*\\sid="${controlledId}"`));
  });

  it("starts expanded so the question and its options are visible", () => {
    const markup = renderPanel();

    expect(markup).toContain("Approach");
    expect(markup).toContain("Which approach should the migration take?");
    expect(markup).toContain("Incremental");
    expect(markup).toContain("Big bang");
  });

  it("renders the question text and option descriptions as markdown", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingUserInputPanel
        pendingUserInputs={[
          {
            requestId: ApprovalRequestId.make("request-md"),
            createdAt: "2026-08-15T00:00:00.000Z",
            questions: [
              {
                id: "question-md",
                header: "CR header",
                question: "## Context\n\nThe **header** is too long; *drop* it?",
                options: [
                  {
                    label: "Drop it",
                    description: "Removes the chip; keeps the *panel*",
                  },
                ],
                multiSelect: false,
              },
            ],
          },
        ]}
        respondingRequestIds={[]}
        answers={{}}
        questionIndex={0}
        onToggleOption={() => {}}
        onAdvance={() => {}}
      />,
    );

    // Question body: markdown, not a raw <p> dump of the source text.
    expect(markup).toContain("<h2");
    expect(markup).toContain("<strong>header</strong>");
    expect(markup).toContain("<em>drop</em>");
    expect(markup).not.toContain("The **header** is too long; *drop* it?");
    // Option description: markdown too.
    expect(markup).toContain("<em>panel</em>");
  });
});
