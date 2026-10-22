// @vitest-environment jsdom
import { act, createContext, useContext, useMemo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
}));

type SelectState = { value: string; onValueChange: (value: string) => void };
const SelectContext = createContext<SelectState>({ value: "", onValueChange: () => undefined });

vi.mock("../ui/select", () => ({
  Select: ({ value, onValueChange, children }: SelectState & { children: ReactNode }) => {
    const state = useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
    return <SelectContext.Provider value={state}>{children}</SelectContext.Provider>;
  },
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => (
    <div data-testid="trigger" {...props}>
      {children}
    </div>
  ),
  SelectValue: ({ children }: { children: (value: string) => ReactNode }) => {
    const { value } = useContext(SelectContext);
    return <span data-testid="selected">{children(value)}</span>;
  },
  SelectPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const { onValueChange } = useContext(SelectContext);
    return (
      <button type="button" data-option={value} onClick={() => onValueChange(value)}>
        {children}
      </button>
    );
  },
}));

import { VoiceLanguageSettingRows } from "./t3team-VoiceLanguageSettingRows";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const TRANSCRIBER = {
  model: "",
  modelPath: "",
  language: "auto",
  languages: "de,en",
  silenceMs: 1500,
};

function render(transcriber: typeof TRANSCRIBER = TRANSCRIBER) {
  const onChange = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<VoiceLanguageSettingRows transcriber={transcriber} onChange={onChange} />);
  });
  return { node: container, onChange };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const options = (node: HTMLElement) =>
  [...node.querySelectorAll("[data-option]")].map((option) => option.textContent);

describe("VoiceLanguageSettingRows", () => {
  it("starts on Auto and offers Auto first, then the configured languages in order, each in its own language", () => {
    const { node } = render({ ...TRANSCRIBER, languages: "en, DE ,fr" });
    expect(node.querySelector('[data-testid="selected"]')?.textContent).toBe("Auto");
    expect(options(node)).toEqual(["Auto", "English", "Deutsch", "Français"]);
  });

  it("shows only Auto when the list is empty, and a code it cannot name as typed", () => {
    expect(options(render({ ...TRANSCRIBER, languages: " , ," }).node)).toEqual(["Auto"]);
    act(() => root?.unmount());
    container?.remove();
    expect(options(render({ ...TRANSCRIBER, languages: "zz" }).node)).toEqual(["Auto", "zz"]);
  });

  it("shows the pinned language as selected, even one missing from the list", () => {
    const { node } = render({ ...TRANSCRIBER, language: "de" });
    expect(node.querySelector('[data-testid="selected"]')?.textContent).toBe("Deutsch");
    act(() => root?.unmount());
    container?.remove();
    const missing = render({ ...TRANSCRIBER, language: "fr" });
    expect(options(missing.node)).toEqual(["Auto", "Deutsch", "English", "Français"]);
  });

  it("pins the language that was picked", () => {
    const { node, onChange } = render();
    act(() => (node.querySelector('[data-option="de"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ language: "de" });
  });

  it("returns to auto-detection when Auto is picked again", () => {
    const { node, onChange } = render({ ...TRANSCRIBER, language: "de" });
    act(() => (node.querySelector('[data-option="auto"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ language: "auto" });
  });

  it("offers a language reset only while a language is pinned", () => {
    expect(render().node.querySelector('button[aria-label="Reset voice language"]')).toBeNull();
    act(() => root?.unmount());
    container?.remove();
    const { node, onChange } = render({ ...TRANSCRIBER, language: "en" });
    act(() => (node.querySelector('button[aria-label^="Reset"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ language: "auto" });
  });

  it("saves an edited list in its normal form", () => {
    const { node, onChange } = render();
    const input = node.querySelector('input[aria-label="Voice language list"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => input.focus());
    act(() => {
      setValue.call(input, " DE, en ,,fr,de ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.blur());
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ languages: "de,en,fr" });
  });
});
