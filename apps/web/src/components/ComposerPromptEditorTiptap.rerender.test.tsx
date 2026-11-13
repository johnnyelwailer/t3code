/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * Live dictation streams a partial transcript into the editor many times a second. Each partial
 * is a ProseMirror decoration, so an utterance re-renders the editor a fixed number of times: the
 * ghost appearing (the placeholder steps aside), one follow-up from the selection handler's
 * same-value setIsEmpty, and the ghost clearing. More partials must not cost more renders.
 */
import { act, createRef, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";
import { renderCounter } from "~/test/t3team-renderCounter";

const PLACEHOLDER = "Frag nach Status, Tickets oder Pull Requests im Projekt";
const WORDS =
  "Bitte öffne das Board der Abteilung Tiefbau und prüfe, ob der Release-Branch für die Kundenfreigabe grün ist".split(
    " ",
  );
const partials = (count: number) =>
  Array.from({ length: count }, (_, index) => WORDS.slice(0, (index % WORDS.length) + 1).join(" "));

async function mountEditor() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const counter = renderCounter();
  const editorRef = createRef<ComposerPromptEditorHandle>();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Profiler id="editor" onRender={() => counter.count("editor")}>
        <ComposerPromptEditorTiptap
          editorRef={editorRef}
          value=""
          cursor={0}
          richTextEnabled={false}
          contextRecords={new Map()}
          skills={[]}
          disabled={false}
          placeholder={PLACEHOLDER}
          onChange={() => {}}
          onPaste={() => {}}
        />
      </Profiler>,
    );
  });
  const setGhost = (text: string) => act(async () => editorRef.current?.setVoiceGhost(text));
  return {
    counter,
    setGhost,
    placeholderShown: () => container.textContent?.includes(PLACEHOLDER) ?? false,
    [Symbol.asyncDispose]: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("ComposerPromptEditorTiptap re-render budget", () => {
  it("re-renders a fixed three times per utterance, however many partials stream", async () => {
    await using editor = await mountEditor();
    for (const count of [4, 40]) {
      expect(editor.placeholderShown()).toBe(true);
      editor.counter.reset();
      for (const partial of partials(count)) await editor.setGhost(partial);
      expect(editor.placeholderShown()).toBe(false);
      await editor.setGhost("");
      editor.counter.expectRerendered({ editor: 3 });
    }
    expect(editor.placeholderShown()).toBe(true);

    editor.counter.reset();
    await editor.setGhost("");
    editor.counter.expectRerendered({});
  });
});
