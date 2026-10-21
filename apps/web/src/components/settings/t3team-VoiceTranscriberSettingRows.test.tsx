// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// Server-scoped rows go inert (no reset) without write access to the primary environment.
vi.mock("../../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
}));

import { VoiceTranscriberSettingRows } from "./t3team-VoiceTranscriberSettingRows";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_TRANSCRIBER = {
  model: "large-v3-turbo",
  modelPath: "",
  language: "auto",
  languages: "de,en",
  silenceMs: 1500,
};

function render(transcriber = DEFAULT_TRANSCRIBER, onChange = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<VoiceTranscriberSettingRows transcriber={transcriber} onChange={onChange} />);
  });
  return { node: container, onChange };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function input(node: HTMLElement, label: string): HTMLInputElement {
  const el = node.querySelector(`input[aria-label="${label}"]`);
  expect(el).not.toBeNull();
  return el as HTMLInputElement;
}

function edit(el: HTMLInputElement, value: string) {
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    el.focus();
  });
  act(() => {
    setNativeValue.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    el.blur();
  });
}

describe("VoiceTranscriberSettingRows", () => {
  it("shows model, model file and language list with the saved values", () => {
    const { node } = render({
      model: "small",
      modelPath: "C:/m/ggml-small.bin",
      language: "de",
      languages: "de,en",
      silenceMs: 1500,
    });
    expect(input(node, "Voice model").value).toBe("small");
    expect(input(node, "Voice model file").value).toBe("C:/m/ggml-small.bin");
    expect(input(node, "Voice language list").value).toBe("de,en");
    expect(node.textContent).toContain("Voice model file");
  });

  it("saves only the edited field, trimmed, when editing finishes", () => {
    const { node, onChange } = render();
    edit(input(node, "Voice model"), "  small  ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ model: "small" });
  });

  it("lets the model file be cleared back to automatic detection", () => {
    const { node, onChange } = render({ ...DEFAULT_TRANSCRIBER, modelPath: "C:/m/x.bin" });
    edit(input(node, "Voice model file"), "   ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ modelPath: "" });
  });

  it("keeps the saved model when the field is cleared", () => {
    const { node, onChange } = render();
    edit(input(node, "Voice model"), "");
    expect(onChange).not.toHaveBeenCalled();
    expect(input(node, "Voice model").value).toBe("large-v3-turbo");
  });

  it("offers a reset only for fields that moved off their default, and restores it", () => {
    const untouched = render();
    expect(untouched.node.querySelector('button[aria-label^="Reset"]')).toBeNull();
    act(() => root?.unmount());
    container?.remove();

    const { node, onChange } = render({ ...DEFAULT_TRANSCRIBER, language: "de" });
    const resets = node.querySelectorAll('button[aria-label^="Reset"]');
    expect(resets).toHaveLength(1);
    act(() => (resets[0] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ language: "auto" });
  });
});
