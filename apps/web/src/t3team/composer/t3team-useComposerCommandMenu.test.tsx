// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

import { detectComposerTrigger } from "~/composer-logic";
import type { T3TeamComposerMenuAppliedText } from "~/t3team/composer/t3team-composerMenuApply";
import type { T3TeamComposerMenuSelectionEffect } from "~/t3team/composer/t3team-composerMenuSelection";

vi.mock("~/lib/composerPathSearchState", () => ({
  useComposerPathSearch: () => ({ entries: [], error: null, isPending: false }),
}));

import { useT3TeamComposerCommandMenu } from "~/t3team/composer/t3team-useComposerCommandMenu";

type MenuValue = ReturnType<typeof useT3TeamComposerCommandMenu>;

const SOURCES = {
  builtInSlashCommands: [
    { command: "model" as const, description: "Switch response model for this thread" },
    { command: "plan" as const, description: "Switch this thread into plan mode" },
  ],
  provider: null,
  providerSlashCommands: [],
  skills: [],
  showSkillsInSlashMenu: true,
};

/**
 * Renders the shared controller the way `ChatComposer` consumes it: the host
 * owns the editor text, so `readSnapshot` reports it and `applyText` writes it
 * back. These are the ChatComposer-specific seams (`readInitialTrigger`,
 * `syncTrigger`, `clearHighlight`) that the kickoff surfaces never exercised.
 */
function renderMenu(initialText: string) {
  const editor = { value: initialText, expandedCursor: initialText.length };
  const applied: T3TeamComposerMenuAppliedText[] = [];
  const effects: T3TeamComposerMenuSelectionEffect[] = [];
  const order: Array<"applied" | "effect"> = [];
  const captured = { current: null as MenuValue | null };

  function Probe() {
    captured.current = useT3TeamComposerCommandMenu({
      sources: SOURCES,
      pathSearch: null,
      // Same call ChatComposer makes for a restored draft.
      readInitialTrigger: () => detectComposerTrigger(editor.value, editor.value.length),
      readSnapshot: () => ({ value: editor.value, expandedCursor: editor.expandedCursor }),
      applyText: (next) => {
        applied.push(next);
        order.push("applied");
        editor.value = next.text;
        editor.expandedCursor = next.expandedCursor;
      },
      onSelectionEffect: (effect) => {
        effects.push(effect);
        order.push("effect");
      },
    });
    return null;
  }

  const container = document.createElement("div");
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  return {
    applied,
    effects,
    order,
    editor,
    menu: () => {
      if (!captured.current) throw new Error("Expected the command menu hook to render.");
      return captured.current;
    },
    unmount: () => {
      act(() => {
        root?.unmount();
      });
    },
  };
}

describe("useT3TeamComposerCommandMenu host seams", () => {
  it("opens on mount when the restored text already ends in a live trigger", () => {
    const rendered = renderMenu("/pl");

    const menu = rendered.menu();
    expect(menu.menuOpen).toBe(true);
    expect(menu.trigger?.kind).toBe("slash-command");
    expect(menu.menuItems.map((item) => item.id)).toEqual(["slash:plan"]);
    // First item is active with no keyboard interaction, so Enter accepts it.
    expect(menu.activeItemId).toBe("slash:plan");

    rendered.unmount();
  });

  it("stays closed on mount when the restored text has no trigger", () => {
    const rendered = renderMenu("ship it");
    expect(rendered.menu().menuOpen).toBe(false);
    expect(rendered.menu().menuItems).toEqual([]);
    rendered.unmount();
  });

  it("re-detects the trigger after a programmatic write and clears the highlight", () => {
    const rendered = renderMenu("");

    act(() => {
      rendered.menu().syncTrigger("/mod", 4);
    });
    expect(rendered.menu().menuOpen).toBe(true);
    expect(rendered.menu().activeItemId).toBe("slash:model");

    act(() => {
      rendered.menu().onHighlightedItemChange("slash:model");
    });
    act(() => {
      rendered.menu().clearHighlight();
    });
    // Clearing falls back to the first item rather than to "nothing active".
    expect(rendered.menu().activeItemId).toBe("slash:model");

    act(() => {
      rendered.menu().syncTrigger("shipped", 7);
    });
    expect(rendered.menu().menuOpen).toBe(false);
    expect(rendered.menu().activeItemId).toBe(null);

    rendered.unmount();
  });

  it("clears the typed range and asks the host to open the model picker without refocusing", () => {
    const rendered = renderMenu("/model");

    act(() => {
      const menu = rendered.menu();
      const item = menu.menuItems.find((candidate) => candidate.id === "slash:model");
      if (!item) throw new Error("Expected a /model item.");
      menu.selectItem(item);
    });

    expect(rendered.editor.value).toBe("");
    expect(rendered.applied).toHaveLength(1);
    expect(rendered.applied[0]?.focusEditorAfterReplace).toBe(false);
    expect(rendered.effects).toEqual([{ type: "open-model-picker" }]);
    // The write closed the trigger, so the menu followed the programmatic write.
    expect(rendered.menu().menuOpen).toBe(false);

    rendered.unmount();
  });

  it("reports a built-in mode command before applying the replacement", () => {
    const rendered = renderMenu("/plan");

    act(() => {
      const menu = rendered.menu();
      const item = menu.menuItems.find((candidate) => candidate.id === "slash:plan");
      if (!item) throw new Error("Expected a /plan item.");
      menu.selectItem(item);
    });

    // ChatComposer switched interaction mode before rewriting the text; the
    // shared controller keeps that order.
    expect(rendered.order).toEqual(["effect", "applied"]);
    expect(rendered.effects).toEqual([{ type: "built-in-slash-command", command: "plan" }]);
    expect(rendered.editor.value).toBe("");
    expect(rendered.applied[0]?.focusEditorAfterReplace).toBe(true);

    rendered.unmount();
  });

  it("refuses to write when the editor moved on since the menu rendered", () => {
    const rendered = renderMenu("/plan");
    const item = rendered.menu().menuItems.find((candidate) => candidate.id === "slash:plan");
    if (!item) throw new Error("Expected a /plan item.");

    // The snapshot the accept reads no longer contains a trigger.
    rendered.editor.value = "done";
    rendered.editor.expandedCursor = 4;

    act(() => {
      rendered.menu().selectItem(item);
    });

    expect(rendered.applied).toEqual([]);
    expect(rendered.editor.value).toBe("done");

    rendered.unmount();
  });
});
