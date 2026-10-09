// @vitest-environment jsdom
import { ApprovalRequestId } from "@t3tools/contracts";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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
  dismissible: true,
};

function renderPanel(pendingUserInput: PendingUserInput = prompt) {
  return renderToStaticMarkup(
    <ComposerPendingUserInputPanel
      pendingUserInputs={[pendingUserInput]}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onAdvance={() => {}}
      onDismiss={() => {}}
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

  it("offers dismiss only for async questions", () => {
    expect(renderPanel()).toContain("data-pending-user-input-dismiss");
    expect(renderPanel({ ...prompt, dismissible: false })).not.toContain(
      "data-pending-user-input-dismiss",
    );
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
            dismissible: false,
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
        onDismiss={() => {}}
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

  it("renders a clamped context strip with an expand affordance above the question", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingUserInputPanel
        pendingUserInputs={[
          {
            requestId: ApprovalRequestId.make("request-ctx"),
            createdAt: "2026-08-15T00:00:00.000Z",
            dismissible: false,
            questions: [
              {
                id: "question-ctx",
                header: "Ship order",
                question: "Which of these should we ship first?",
                context: "### Proposed options\n\n1. Ship A — smallest, ships this week",
                options: [
                  { label: "Ship A", description: "Ships this week" },
                  { label: "Ship B", description: "User requested" },
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
        onDismiss={() => {}}
      />,
    );

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

  it("omits the context strip entirely when the question carries no context", () => {
    const markup = renderPanel();

    expect(markup).not.toContain("Show full context");
    expect(markup).not.toContain("line-clamp-4");
  });
});

// Dock-time focus behavior needs a live DOM: the card's initial state reads
// document.activeElement at mount, and the number-key handler attaches to the
// document.
describe("ComposerPendingUserInputPanel dock focus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Mounts the panel while `focused` describes where focus sits: the composer
  // editor when the user is mid-typing, or the document body otherwise.
  function dock({
    focused,
    onToggleOption = vi.fn(),
    onAdvance = vi.fn(),
  }: {
    focused: "editor" | "body";
    onToggleOption?: (questionId: string, optionValue: string) => void;
    onAdvance?: () => void;
  }) {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("data-testid", "composer-editor");
    document.body.appendChild(editor);
    (focused === "editor" ? editor : document.body).focus();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <ComposerPendingUserInputPanel
          pendingUserInputs={[prompt]}
          respondingRequestIds={[]}
          answers={{}}
          questionIndex={0}
          onToggleOption={onToggleOption}
          onAdvance={onAdvance}
          onDismiss={() => {}}
        />,
      );
    });
    return {
      host,
      root,
      editor,
      onToggleOption,
      onAdvance,
      get toggle() {
        return host.querySelector<HTMLButtonElement>("[data-pending-user-input-toggle]");
      },
    };
  }

  it("mounts collapsed and leaves focus in the composer when the user is mid-typing", () => {
    const { editor, host, root, toggle } = dock({ focused: "editor" });

    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("collapsed");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    // The header stays; the question body and its options do not mount.
    expect(host.textContent).toContain("Approach");
    expect(host.textContent).not.toContain("Incremental");
    // Nothing in the card grabbed focus: the editor still holds it.
    expect(document.activeElement).toBe(editor);

    act(() => {
      root.unmount();
    });
  });

  it("mounts expanded and leaves focus alone when the composer is not focused", () => {
    const { host, root, toggle } = dock({ focused: "body" });

    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("expanded");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain("Incremental");
    // No forced focus: whatever held focus before the dock keeps it.
    expect(document.activeElement).toBe(document.body);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the disclosure, option selection and auto-advance on a collapsed dock", async () => {
    const { host, root, toggle, onToggleOption, onAdvance } = dock({ focused: "editor" });
    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("collapsed");

    // Expand via the disclosure control.
    act(() => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("expanded");
    expect(host.textContent).toContain("Incremental");

    // Selecting an option is recorded immediately; single-select auto-advance follows.
    const incremental = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Incremental"),
    );
    act(() => {
      incremental?.click();
    });
    expect(onToggleOption).toHaveBeenCalledWith("question-1", "Incremental");
    expect(onAdvance).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("opts the number-key shortcut out of a collapsed dock and back in when expanded", () => {
    let selections = 0;
    const { root, toggle } = dock({
      focused: "editor",
      onToggleOption: () => {
        selections += 1;
      },
    });
    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("collapsed");

    // Focus moves to a neutral control (the user clicked elsewhere); while the
    // card is collapsed, digit keys must not select options.
    const neutral = document.createElement("button");
    document.body.appendChild(neutral);
    neutral.focus();
    act(() => {
      neutral.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    });
    expect(selections).toBe(0);

    // Expanding restores the shortcut.
    act(() => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("data-pending-user-input-toggle")).toBe("expanded");
    act(() => {
      neutral.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    });
    expect(selections).toBe(1);

    act(() => {
      root.unmount();
    });
  });
});
