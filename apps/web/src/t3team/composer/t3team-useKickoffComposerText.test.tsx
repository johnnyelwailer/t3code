// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { readKickoffComposerDraft } from "~/t3team/composer/t3team-kickoffComposerDraft";
import { useT3TeamKickoffComposerText } from "~/t3team/composer/t3team-useKickoffComposerText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof useT3TeamKickoffComposerText>;
type HookProps = { prefillText?: string; draftKey?: string | null };

function Probe(props: HookProps & { onResult: (result: HookResult) => void }) {
  const result = useT3TeamKickoffComposerText({
    prefillText: props.prefillText,
    hasSelectedRecipe: false,
    draftKey: props.draftKey ?? null,
  });
  props.onResult(result);
  return null;
}

function mount(initial: HookProps) {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const latest: { current: HookResult | null } = { current: null };
  const onResult = (result: HookResult) => {
    latest.current = result;
  };
  const render = (props: HookProps) =>
    act(() => root.render(<Probe {...props} onResult={onResult} />));
  render(initial);
  return { latest, render, unmount: () => act(() => root.unmount()) };
}

describe("useT3TeamKickoffComposerText draft persistence", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("restores the text after a remount (reload / app restart)", () => {
    const first = mount({ draftKey: "project:p1" });
    act(() => first.latest.current?.setText("Investigate the slow dashboard"));
    expect(readKickoffComposerDraft("project:p1")).toBe("Investigate the slow dashboard");
    first.unmount();

    const second = mount({ draftKey: "project:p1" });
    expect(second.latest.current?.text).toBe("Investigate the slow dashboard");
    expect(second.latest.current?.cursor).toBe("Investigate the slow dashboard".length);
    second.unmount();
  });

  it("clears the stored draft when the text is cleared on submit", () => {
    const view = mount({ draftKey: "project:p1" });
    act(() => view.latest.current?.setText("send me"));
    act(() => view.latest.current?.setText(""));
    expect(readKickoffComposerDraft("project:p1")).toBeNull();
    view.unmount();
  });

  it("lets an explicit prefill win over a stored draft", () => {
    const view = mount({ draftKey: "project:p1" });
    act(() => view.latest.current?.setText("typed earlier"));
    view.unmount();
    const prefilled = mount({ draftKey: "project:p1", prefillText: "Recipe prompt" });
    expect(prefilled.latest.current?.text).toBe("Recipe prompt");
    prefilled.unmount();
  });

  it("swaps to the other surface's draft when the key changes", () => {
    const view = mount({ draftKey: "ticket:p1:a" });
    act(() => view.latest.current?.setText("draft for A"));
    view.render({ draftKey: "ticket:p1:b" });
    expect(view.latest.current?.text).toBe("");
    act(() => view.latest.current?.setText("draft for B"));
    view.render({ draftKey: "ticket:p1:a" });
    expect(view.latest.current?.text).toBe("draft for A");
    expect(readKickoffComposerDraft("ticket:p1:b")).toBe("draft for B");
    view.unmount();
  });

  it("does not persist without a key", () => {
    const view = mount({ draftKey: null });
    act(() => view.latest.current?.setText("ephemeral"));
    expect(window.localStorage.length).toBe(0);
    view.unmount();
  });
});
