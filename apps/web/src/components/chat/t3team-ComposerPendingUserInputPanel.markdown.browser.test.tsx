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

// Ask-user questions may carry a markdown `context`; the V2 question type does not declare it yet.
function withQuestionContext(
  question: PendingUserInput["questions"][number] & { readonly context: string },
): PendingUserInput["questions"][number] {
  return question;
}

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
    expect(markup).toContain("<p>Which first?</p>");
    expect(markup).toMatch(/Smallest change<br>\s*No migration/);
  });

  it("renders a clamped context strip with an expand affordance above the question", async () => {
    const markup = await renderPanel({
      ...prompt,
      dismissible: false,
      questions: [
        withQuestionContext({
          id: "question-ctx",
          header: "Ship order",
          question: "Which of these should we ship first?",
          context: "### Proposed options\n\n1. Ship A — smallest, ships this week",
          options: [
            { label: "Ship A", description: "Ships this week" },
            { label: "Ship B", description: "User requested" },
          ],
          multiSelect: false,
        }),
      ],
    });

    // Context renders as markdown, is clamped, and carries the expand affordance.
    expect(markup).toMatch(/<h3[^>]*>Proposed options<\/h3>/);
    expect(markup).toContain("line-clamp-4");
    expect(markup).toContain("Show full context");
    // The strip sits ABOVE the question: context markup precedes the question text.
    const contextAt = markup.indexOf("Ship A — smallest, ships this week");
    const questionAt = markup.indexOf("Which of these should we ship first?");
    expect(contextAt).toBeGreaterThan(-1);
    expect(questionAt).toBeGreaterThan(-1);
    expect(contextAt).toBeLessThan(questionAt);
  });

  it("omits the context strip entirely when the question carries no context", async () => {
    const markup = await renderPanel();

    expect(markup).not.toContain("Show full context");
    expect(markup).not.toContain("line-clamp-4");
  });
});
