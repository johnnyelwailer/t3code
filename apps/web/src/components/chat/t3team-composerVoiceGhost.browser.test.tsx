import { createRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { serializeEditorDoc } from "~/composer-rich-text-doc";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditorTiptap";

const PLACEHOLDER = "Frag nach Status, Tickets oder Pull Requests im Projekt";

function DraftComposer({
  value,
  richText = false,
  placeholder = "",
}: {
  value: string;
  richText?: boolean;
  placeholder?: string;
}) {
  const [cursor, setCursor] = useState(value.length);
  const editorRef = createRef<ComposerPromptEditorHandle>();
  return (
    <div data-testid="draft-composer">
      <ComposerPromptEditorTiptap
        editorRef={editorRef}
        value={value}
        cursor={cursor}
        richTextEnabled={richText}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder={placeholder}
        onChange={(nextValue, nextCursor) => setCursor(nextCursor)}
        onPaste={() => {}}
      />
      <button
        type="button"
        data-testid="set-ghost"
        onClick={() => editorRef.current?.setVoiceGhost("open the board")}
      >
        ghost
      </button>
      <button
        type="button"
        data-testid="set-ghost-2"
        onClick={() => editorRef.current?.setVoiceGhost("open the board and the deploy")}
      >
        ghost 2
      </button>
      <button
        type="button"
        data-testid="clear-ghost"
        onClick={() => editorRef.current?.setVoiceGhost("")}
      >
        clear
      </button>
    </div>
  );
}

function editorIn(container: HTMLElement): Editor {
  const element = container.querySelector<HTMLElement & { editor: Editor }>(".tiptap");
  if (!element) throw new Error("Composer did not mount");
  return element.editor;
}

describe("composer voice ghost", () => {
  it("renders the live words as muted ghost text at the end of the draft, outside the document", async () => {
    await using screen = await render(<DraftComposer value="Check the release" />);
    const before = serializeEditorDoc(editorIn(screen.container).state.doc).value;
    await screen.getByTestId("set-ghost").click();
    const ghost = screen.container.querySelector(".composer-voice-ghost");
    expect(ghost?.textContent).toBe("open the board");
    expect(ghost?.className).toContain("text-muted-foreground/60");
    // Same line: the ghost is inside the last paragraph, not a sibling after it.
    const lastParagraph = screen.container.querySelectorAll(".tiptap p");
    expect(ghost?.closest("p")).toBe(lastParagraph[lastParagraph.length - 1]);
    expect(lastParagraph[lastParagraph.length - 1]!.textContent).toBe(
      "Check the releaseopen the board",
    );
    expect(serializeEditorDoc(editorIn(screen.container).state.doc).value).toBe(before);
  });

  it("lands inside the last text block when it is nested in a rich block", async () => {
    await using screen = await render(<DraftComposer value={"> Check the release"} richText />);
    const before = serializeEditorDoc(editorIn(screen.container).state.doc).value;
    await screen.getByTestId("set-ghost").click();
    const ghost = screen.container.querySelector(".composer-voice-ghost");
    expect(ghost?.textContent).toBe("open the board");
    const lastParagraph = screen.container.querySelectorAll(".tiptap p");
    expect(ghost?.closest("p")).toBe(lastParagraph[lastParagraph.length - 1]);
    expect(ghost?.closest("blockquote")).not.toBeNull();
    expect(lastParagraph[lastParagraph.length - 1]!.textContent).toBe(
      "Check the releaseopen the board",
    );
    expect(serializeEditorDoc(editorIn(screen.container).state.doc).value).toBe(before);
  });

  it("hides the placeholder while the ghost fills an empty draft, and restores it after", async () => {
    await using screen = await render(<DraftComposer value="" placeholder={PLACEHOLDER} />);
    await expect.element(screen.getByText(PLACEHOLDER)).toBeVisible();
    await screen.getByTestId("set-ghost").click();
    expect(screen.container.querySelector(".composer-voice-ghost")?.textContent).toBe(
      "open the board",
    );
    await expect.element(screen.getByText(PLACEHOLDER)).not.toBeInTheDocument();
    await screen.getByTestId("clear-ghost").click();
    await expect.element(screen.getByText(PLACEHOLDER)).toBeVisible();
  });

  it("re-renders the span for each successive partial", async () => {
    await using screen = await render(<DraftComposer value="Check the release" />);
    await screen.getByTestId("set-ghost").click();
    expect(screen.container.querySelector(".composer-voice-ghost")?.textContent).toBe(
      "open the board",
    );
    await screen.getByTestId("set-ghost-2").click();
    const spans = screen.container.querySelectorAll(".composer-voice-ghost");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe("open the board and the deploy");
  });

  it("clears on an empty ghost and leaves the draft untouched", async () => {
    await using screen = await render(<DraftComposer value="Check the release" />);
    await screen.getByTestId("set-ghost").click();
    expect(screen.container.querySelector(".composer-voice-ghost")).not.toBeNull();
    await screen.getByTestId("clear-ghost").click();
    expect(screen.container.querySelector(".composer-voice-ghost")).toBeNull();
    expect(serializeEditorDoc(editorIn(screen.container).state.doc).value).toBe(
      "Check the release",
    );
  });
});
