// @vitest-environment jsdom
/**
 * AgentInstructionsSettingRow — global "Personality / Instructions" control:
 * the textarea shows the current value, commits the trimmed value on blur
 * (only when it actually changed), supports Cmd/Ctrl+Enter, and offers a
 * "Reset to default" button only when a custom value is set.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AgentInstructionsInput, AgentInstructionsSettingRow } from "./AgentInstructionsSetting";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(element);
  });
  return container!;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const commit = vi.fn();

/** Set a controlled textarea's value the way React's change handler will see it. */
function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setNativeValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setNativeValue.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(textarea: HTMLTextAreaElement) {
  act(() => {
    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function keyDown(textarea: HTMLTextAreaElement, event: KeyboardEvent) {
  act(() => {
    textarea.dispatchEvent(event);
  });
}

function textareaOf(node: HTMLDivElement): HTMLTextAreaElement {
  const el = node.querySelector('textarea[aria-label="Agent personality and instructions"]');
  expect(el).not.toBeNull();
  return el as HTMLTextAreaElement;
}

describe("AgentInstructionsInput", () => {
  it("shows the current value", () => {
    const node = render(<AgentInstructionsInput value="Be brief." onCommit={() => {}} />);
    expect(textareaOf(node).value).toBe("Be brief.");
  });

  it("commits the trimmed value on blur when it changed, and nothing when unchanged", () => {
    const node = render(<AgentInstructionsInput value="" onCommit={commit} />);
    const textarea = textareaOf(node);

    typeInto(textarea, "  Keep replies short. ");
    // Typing alone must not write settings.
    expect(commit).not.toHaveBeenCalled();

    blur(textarea);
    expect(commit).toHaveBeenCalledWith("Keep replies short.");

    // Simulate the settings round-trip: the app re-renders with the committed
    // value, so a second blur with no change must not commit again.
    act(() => {
      root!.render(<AgentInstructionsInput value="Keep replies short." onCommit={commit} />);
    });
    blur(textarea);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits on Cmd/Ctrl+Enter without blurring", () => {
    const node = render(<AgentInstructionsInput value="" onCommit={commit} />);
    const textarea = textareaOf(node);

    typeInto(textarea, "Explain with examples.");
    keyDown(
      textarea,
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(commit).toHaveBeenCalledWith("Explain with examples.");
  });

  it("caps the editable length at the settings schema cap", () => {
    const node = render(<AgentInstructionsInput value="" onCommit={() => {}} />);
    expect(textareaOf(node).maxLength).toBe(20_000);
  });
});

describe("AgentInstructionsSettingRow", () => {
  it("renders the row with the current value and no reset while empty", () => {
    const node = render(<AgentInstructionsSettingRow value="" onChange={() => {}} />);
    expect(node.textContent).toContain("Agent personality / instructions");
    expect(node.textContent).toContain("built-in default personality");
    // No reset button while the value is the default (empty).
    expect(
      node.querySelector('button[aria-label="Reset agent personality to default"]'),
    ).toBeNull();
  });

  it("offers reset when a custom value is set and commits the empty default", () => {
    const onChange = vi.fn();
    const node = render(<AgentInstructionsSettingRow value="Custom." onChange={onChange} />);
    const reset = node.querySelector(
      'button[aria-label="Reset agent personality to default"]',
    ) as HTMLButtonElement;
    expect(reset).not.toBeNull();
    act(() => {
      reset.click();
    });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
