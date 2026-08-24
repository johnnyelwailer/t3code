// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("~/lib/composerPathSearchState", () => ({
  useComposerPathSearch: () => ({ entries: [], error: null, isPending: false }),
}));
vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";
import { KickoffComposerEditor } from "~/t3team/composer/t3team-KickoffComposerEditor";
import { t3teamComposerMenuOptionDomId } from "~/t3team/composer/t3team-composerMenuKeyboard";
import type { T3TeamComposerMenuSelectionEffect } from "~/t3team/composer/t3team-composerMenuSelection";
import { buildT3TeamRecipeSlashItems } from "~/t3team/composer/t3team-composerRecipeSlashItems";
import { useT3TeamComposerCommandMenu } from "~/t3team/composer/t3team-useComposerCommandMenu";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const recipes: ReadonlyArray<T3TeamSidecarRecipeQuickStart> = [
  { id: "alpha-recipe", slashAlias: "alpha", title: "Alpha", description: "", prompt: "" },
  { id: "beta-recipe", slashAlias: "beta", title: "Beta", description: "", prompt: "" },
];

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/**
 * Mounts the real kickoff editor (Lexical prompt editor + slash menu) so key
 * presses travel the production path: DOM keydown -> Lexical command plugin ->
 * `handleCommandKeyDown` -> `selectItem`.
 *
 * jsdom does not run Lexical's controlled-value write-back, so `readSnapshot`
 * falls back to the harness text when the editor state is still empty; the live
 * app gets the same string from Lexical itself.
 */
function mount() {
  const effects: T3TeamComposerMenuSelectionEffect[] = [];
  let openMenu: (value: string) => void = () => {};

  function Probe() {
    const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
    const [text, setText] = useState("");
    const [cursor, setCursor] = useState(0);
    const snapshotRef = useRef({ text, cursor });
    snapshotRef.current = { text, cursor };
    const commandMenu = useT3TeamComposerCommandMenu({
      sources: {
        builtInSlashCommands: [],
        provider: null,
        providerSlashCommands: [],
        skills: [],
        showSkillsInSlashMenu: true,
      },
      pathSearch: null,
      readSnapshot: () => {
        const live = editorRef.current?.readSnapshot();
        return live && live.value.length > 0
          ? live
          : { value: snapshotRef.current.text, expandedCursor: snapshotRef.current.cursor };
      },
      applyText: (next) => {
        setText(next.text);
        setCursor(next.cursor);
      },
      onSelectionEffect: (effect) => effects.push(effect),
      buildExtraItems: (trigger) =>
        trigger.kind === "slash-command"
          ? buildT3TeamRecipeSlashItems({ recipes, reservedAliases: [], query: trigger.query })
          : [],
    });
    openMenu = (value) => {
      setText(value);
      setCursor(value.length);
      commandMenu.handleEditorChange(value, value.length, false);
    };
    return (
      <KickoffComposerEditor
        editorRef={editorRef}
        text={text}
        cursor={cursor}
        skills={[]}
        placeholder="test"
        disabled={false}
        commandMenu={commandMenu}
        onChangeText={(nextValue, nextCursor) => {
          setText(nextValue);
          setCursor(nextCursor);
        }}
      />
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });

  const editor = () => {
    const element = container.querySelector<HTMLElement>('[data-testid="composer-editor"]');
    if (!element) throw new Error("composer editor not rendered");
    return element;
  };
  return {
    effects: () => effects,
    open: (value: string) => act(() => openMenu(value)),
    editor,
    options: () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')),
    listbox: () => container.querySelector<HTMLElement>('[role="listbox"]'),
    activeOptions: () =>
      Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')).filter(
        (element) => element.getAttribute("aria-selected") === "true",
      ),
  };
}

function keydown(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("kickoff composer slash menu keyboard", () => {
  it("renders the recipe options as a listbox", () => {
    const probe = mount();
    probe.open("/");
    expect(probe.listbox()).not.toBeNull();
    expect(probe.options().map((element) => element.dataset.composerItemId)).toEqual([
      "recipe-slash-command:alpha",
      "recipe-slash-command:beta",
    ]);
  });

  it("accepts the first option on Enter with no navigation", () => {
    const probe = mount();
    probe.open("/");
    keydown(probe.editor(), "Enter");
    expect(probe.effects()).toEqual([{ type: "select-recipe", recipe: recipes[0] }]);
  });

  it("accepts the second option after ArrowDown", () => {
    const probe = mount();
    probe.open("/");
    keydown(probe.editor(), "ArrowDown");
    expect(probe.activeOptions()[0]?.dataset.composerItemId).toBe("recipe-slash-command:beta");
    keydown(probe.editor(), "Enter");
    expect(probe.effects()).toEqual([{ type: "select-recipe", recipe: recipes[1] }]);
  });

  it("moves the highlight back up", () => {
    const probe = mount();
    probe.open("/");
    keydown(probe.editor(), "ArrowDown");
    keydown(probe.editor(), "ArrowUp");
    expect(probe.activeOptions()[0]?.dataset.composerItemId).toBe("recipe-slash-command:alpha");
  });

  it("accepts the highlighted option on Tab", () => {
    const probe = mount();
    probe.open("/");
    keydown(probe.editor(), "ArrowDown");
    keydown(probe.editor(), "Tab");
    expect(probe.effects()).toEqual([{ type: "select-recipe", recipe: recipes[1] }]);
  });

  it("closes on Escape without accepting", () => {
    const probe = mount();
    probe.open("/");
    keydown(probe.editor(), "Escape");
    expect(probe.effects()).toEqual([]);
    expect(probe.options()).toHaveLength(0);
    expect(probe.editor().hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("tracks the highlight with aria-selected and aria-activedescendant", () => {
    const probe = mount();
    probe.open("/");
    const first = probe.activeOptions();
    expect(first).toHaveLength(1);
    expect(first[0]?.dataset.composerItemId).toBe("recipe-slash-command:alpha");
    const listboxId = probe.listbox()?.id ?? "";
    expect(listboxId).toBeTruthy();
    expect(first[0]?.id).toBe(
      t3teamComposerMenuOptionDomId(listboxId, "recipe-slash-command:alpha"),
    );
    expect(probe.editor().getAttribute("aria-activedescendant")).toBe(first[0]?.id);
    expect(probe.editor().getAttribute("aria-controls")).toBe(probe.listbox()?.id);

    keydown(probe.editor(), "ArrowDown");
    const second = probe.activeOptions();
    expect(second).toHaveLength(1);
    expect(second[0]?.dataset.composerItemId).toBe("recipe-slash-command:beta");
    expect(probe.editor().getAttribute("aria-activedescendant")).toBe(second[0]?.id);
  });
});
