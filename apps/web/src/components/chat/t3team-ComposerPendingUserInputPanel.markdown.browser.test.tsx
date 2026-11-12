import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PendingUserInput } from "../../session-logic";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };

const prompt: PendingUserInput = {
  requestId: RuntimeRequestId.make("request-1"),
  responseCapability: "live" as const,
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
  dismissible: true,
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPanel(pendingUserInput: PendingUserInput = prompt) {
  await act(async () =>
    root.render(
      <ComposerPendingUserInputPanel
        pendingUserInputs={[pendingUserInput]}
        cwd="/repo"
        threadRef={threadRef}
        respondingRequestIds={[]}
        answers={{}}
        questionIndex={0}
        onToggleOption={() => {}}
        onAdvance={() => {}}
        onDismiss={() => {}}
      />,
    ),
  );
  return container.innerHTML;
}

describe("ComposerPendingUserInputPanel markdown", () => {
  it("renders the question text and option descriptions as markdown", async () => {
    const markup = await renderPanel({
      ...prompt,
      dismissible: false,
      questions: [
        {
          id: "question-md",
          header: "CR header",
          question: "## Context\n\nThe **header** is too long; *drop* it?",
          options: [{ label: "Drop it", description: "Removes the chip; keeps the *panel*" }],
          multiSelect: false,
        },
      ],
    });

    // Question body: markdown, not a raw <p> dump of the source text.
    expect(markup).toContain("<h2");
    expect(markup).toContain("<strong>header</strong>");
    expect(markup).toContain("<em>drop</em>");
    expect(markup).not.toContain("The **header** is too long; *drop* it?");
    // Option description: markdown too.
    expect(markup).toContain("<em>panel</em>");
  });

  it("keeps single newlines in the question and option descriptions as line breaks", async () => {
    const markup = await renderPanel({
      ...prompt,
      questions: [
        {
          id: "question-lines",
          header: "Ship order",
          question: "Two options are ready.\nA ships this week.\nB needs review.\n\nWhich first?",
          options: [{ label: "Ship A", description: "Smallest change\nNo migration" }],
          multiSelect: false,
        },
      ],
    });

    expect(markup).toMatch(
      /Two options are ready\.<br>\s*A ships this week\.<br>\s*B needs review\./,
    );
    // Markdown paragraphs may carry a text-direction attribute.
    expect(markup).toMatch(/<p[^>]*>Which first\?<\/p>/);
    expect(markup).toMatch(/Smallest change<br>\s*No migration/);
  });

  it("renders the context t3_ask_user folds into the question above the question text", async () => {
    // The server places the ask-user `context` markdown above the question, separated by a blank
    // line (t3team-askUserQuestion.ts), so the panel only ever sees one question string.
    const markup = await renderPanel({
      ...prompt,
      dismissible: false,
      questions: [
        {
          id: "question-ctx",
          header: "Ship order",
          question:
            "### Proposed options\n\n1. Ship A — smallest, ships this week\n\nWhich of these should we ship first?",
          options: [
            { label: "Ship A", description: "Ships this week" },
            { label: "Ship B", description: "User requested" },
          ],
          multiSelect: false,
        },
      ],
    });

    // The folded context renders as markdown, not as raw source text.
    expect(markup).toMatch(/<h3[^>]*>Proposed options<\/h3>/);
    expect(markup).not.toContain("### Proposed options");
    // It stays full: no separate clamped strip hides part of it behind an expand affordance.
    expect(markup).not.toContain("line-clamp-4");
    expect(markup).not.toContain("Show full context");
    // The context precedes the question text.
    const contextAt = markup.indexOf("Ship A — smallest, ships this week");
    const questionAt = markup.indexOf("Which of these should we ship first?");
    expect(contextAt).toBeGreaterThan(-1);
    expect(questionAt).toBeGreaterThan(-1);
    expect(contextAt).toBeLessThan(questionAt);
  });

  it("renders no context strip for a plain question", async () => {
    const markup = await renderPanel();

    expect(markup).not.toContain("Show full context");
    expect(markup).not.toContain("line-clamp-4");
  });
});
