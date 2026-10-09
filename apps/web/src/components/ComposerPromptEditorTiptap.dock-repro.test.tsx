// @vitest-environment jsdom
import { act, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { ApprovalRequestId, type PendingUserInput } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditorTiptap";
import {
  isEditingComposerDraft,
  resolveComposerPromptEditorValue,
} from "~/components/composerDraftAnswerState";

// ProseMirror's caret scrolling probes geometry jsdom does not implement.
// Return empty rects so PM's scroll-into-view degrades to a no-op.
if (typeof Range !== "undefined") {
  const emptyRects = () => ({ length: 0, item: () => null });
  const emptyRect = () => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyRects;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = emptyRect;
  }
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

function makePrompt(d: { allowCustomAnswer?: boolean } = {}): PendingUserInput {
  return {
    requestId: ApprovalRequestId.make("request-1"),
    createdAt: "2026-10-09T00:00:00.000Z",
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
        allowCustomAnswer: d.allowCustomAnswer ?? true,
      },
    ],
    dismissible: true,
  };
}

export type DockControls = {
  dock: (prompt: PendingUserInput) => void;
  focusEditorAt: (cursor: number) => void;
};

/**
 * Mirrors the ChatComposer wiring: prompt/cursor are local state, the editor
 * value/cursor come from resolveComposerPromptEditorState, and onChange routes
 * through the draft vs answer branches exactly as onPromptChange does.
 * isComposerFocused mirrors useComposerFocusState via the surface's
 * focus/blur capture.
 */
function DockTestApp({ controls }: { controls: { current: DockControls | null } }) {
  const [prompt, setPrompt] = useState("in progress draft");
  const [cursor, setCursor] = useState(11); // "in progress| draft"
  const [pending, setPending] = useState<PendingUserInput | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const handleFocus = useCallback(() => setIsComposerFocused(true), []);
  const handleBlur = useCallback(() => {
    const surface = surfaceRef.current;
    const active = document.activeElement;
    if (surface && active instanceof HTMLElement && !surface.contains(active)) {
      setIsComposerFocused(false);
    }
  }, []);

  controls.current = {
    dock(next) {
      setPending(next);
    },
    focusEditorAt(next) {
      editorRef.current?.focusAt(next);
    },
  };

  const question = pending ? pending.questions[0]! : null;
  const answer = pending ? "" : null;
  const state = {
    isComposerApprovalState: false,
    activePendingQuestion: question,
    draft: prompt,
    activePendingCustomAnswer: answer,
    activePendingHasOptionSelection: false,
    isComposerFocused,
  };

  return (
    <div
      ref={surfaceRef}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      data-testid="composer-surface"
    >
      <ComposerPromptEditorTiptap
        editorRef={editorRef}
        richTextEnabled
        value={resolveComposerPromptEditorValue(state)}
        cursor={cursor}
        contextRecords={[]}
        skills={[]}
        onChange={(nextValue, nextCursor) => {
          const editingDraft = isEditingComposerDraft(state);
          if (question && pending && !editingDraft) {
            // Answer branch: the editor is cleared and the answer is tracked.
            setPrompt("");
            setCursor(0);
            return;
          }
          setPrompt(nextValue);
          setCursor(nextCursor);
        }}
        onPaste={() => {}}
        placeholder={
          pending
            ? "Type your own answer, or leave this blank to use the selected option"
            : "Ask anything"
        }
        disabled={false}
      />
      {pending ? <div data-testid="docked-panel">panel</div> : null}
    </div>
  );
}

function typeTextAtCaret(editor: HTMLElement, char: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    throw new Error("expected a collapsed caret in the editor");
  }
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!(node instanceof Text)) {
    throw new Error(`expected caret in a text node, got ${node.nodeName}`);
  }
  const offset = range.startOffset;
  act(() => {
    node.data = node.data.slice(0, offset) + char + node.data.slice(offset);
  });
}

function snapshot() {
  const editor = container!.querySelector('[data-testid="composer-editor"]')!;
  const selection = window.getSelection();
  let caretOffset = -1;
  if (
    selection &&
    selection.rangeCount > 0 &&
    selection.isCollapsed &&
    selection.anchorNode instanceof Text
  ) {
    caretOffset = selection.anchorOffset;
  }
  return {
    editor,
    text: editor.textContent,
    caretInEditor: editor.contains(document.activeElement),
    nativeCaretOffset: caretOffset,
  };
}

describe("pending question dock vs composer draft caret", () => {
  it("keeps the caret and content when a free-answer question docks mid-draft", async () => {
    const controls: { current: DockControls | null } = { current: null };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<DockTestApp controls={controls} />));
    expect(controls.current).toBeTruthy();

    const before = snapshot();
    await act(async () => {
      controls.current!.focusEditorAt(11);
    });
    expect(snapshot().caretInEditor).toBe(true);
    expect(container!.querySelector('[data-testid="composer-editor"]')!.textContent).toBe(
      "in progress draft",
    );
    const editorNodeBefore = container!.querySelector('[data-testid="composer-editor"]')!;

    // Dock the question while the editor holds focus.
    act(() => {
      controls.current!.dock(makePrompt({}));
    });
    await act(async () => {});

    const after = snapshot();
    expect(after.editor).toBe(editorNodeBefore); // no remount
    expect(after.text).toBe("in progress draft"); // content preserved
    expect(after.caretInEditor).toBe(true); // focus preserved
    expect(after.nativeCaretOffset).toBe(11); // "in progress| draft"
    expect(container!.querySelector('[data-testid="docked-panel"]')).toBeTruthy();

    // A keystroke after the dock inserts at the preserved offset.
    typeTextAtCaret(after.editor, "X");
    await act(async () => {});
    expect(snapshot().text).toBe("in progressX draft");
  }, 30000);
});
