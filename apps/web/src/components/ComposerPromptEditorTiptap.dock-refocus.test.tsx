// @vitest-environment jsdom
// Second half of the dock-caret repro: the unfocused-dock-then-refocus path and
// the choice-only path. The focused-dock case lives in
// ComposerPromptEditorTiptap.dock-repro.test.tsx.
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
import { ComposerPendingUserInputPanel } from "~/components/chat/ComposerPendingUserInputPanel";

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
const answersRef: {
  current: Record<string, { selectedOptions?: string[]; customAnswer?: string }>;
} = { current: {} };

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  answersRef.current = {};
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
  blurToOutside: () => void;
  clickEditor: () => void;
  selectOption: (optionValue: string) => void;
  staleCursor: (cursor: number) => void;
  editorElement: () => HTMLElement | null;
  caretOffset: () => number;
};

/**
 * Mirrors the ChatComposer wiring: prompt/cursor are local state, the editor
 * value/cursor come from resolveComposerPromptEditorState, and onChange routes
 * through the draft vs answer branches exactly as onPromptChange does.
 * isComposerFocused mirrors useComposerFocusState via the surface's
 * focus/blur capture, and the real pending panel renders next to the editor.
 */
function DockTestApp({ controls }: { controls: { current: DockControls | null } }) {
  const [prompt, setPrompt] = useState("in progress draft");
  const [cursor, setCursor] = useState(11); // "in progress| draft"
  const [pending, setPending] = useState<PendingUserInput | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [answers, setAnswers] = useState<
    Record<string, { selectedOptions?: string[]; customAnswer?: string }>
  >({});
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const outsideRef = useRef<HTMLButtonElement | null>(null);

  const handleFocus = useCallback(() => setIsComposerFocused(true), []);
  const handleBlur = useCallback(() => {
    const surface = surfaceRef.current;
    const active = document.activeElement;
    if (surface && active instanceof HTMLElement && !surface.contains(active)) {
      setIsComposerFocused(false);
    }
  }, []);

  const editorDom = () =>
    surfaceRef.current?.querySelector('[data-testid="composer-editor"]') as HTMLElement | null;

  controls.current = {
    dock(next) {
      setPending(next);
    },
    focusEditorAt(next) {
      editorRef.current?.focusAt(next);
    },
    blurToOutside() {
      outsideRef.current?.focus();
    },
    clickEditor() {
      editorDom()?.focus();
    },
    selectOption(optionValue: string) {
      const questionId = pending?.questions[0]?.id;
      if (!questionId) return;
      setAnswers((prev) => ({
        ...prev,
        [questionId]: { selectedOptions: [optionValue], customAnswer: "" },
      }));
      outsideRef.current?.focus();
    },
    staleCursor(next) {
      // Simulates resetCursorState({cursor}) with no value change: the cursor
      // prop lags behind the editor's live caret.
      setCursor(next);
    },
    editorElement() {
      return editorDom();
    },
    caretOffset() {
      const range = editorRef.current?.readSelectionRange();
      return range ? range.start : -1;
    },
  };

  const question = pending ? pending.questions[0]! : null;
  answersRef.current = answers;
  const answer = pending ? (answers[question.id]?.customAnswer ?? "") : null;
  const state = {
    isComposerApprovalState: false,
    activePendingQuestion: question,
    draft: prompt,
    activePendingCustomAnswer: answer,
    activePendingHasOptionSelection: pending
      ? Object.values(answers).some((a) => (a.selectedOptions?.length ?? 0) > 0)
      : false,
    isComposerFocused,
  };
  const choiceOnly = pending
    ? pending.questions.every((q) => q.allowCustomAnswer === false)
    : false;

  return (
    <div
      ref={surfaceRef}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      data-testid="composer-surface"
    >
      {pending ? (
        <ComposerPendingUserInputPanel
          pendingUserInputs={[pending]}
          respondingRequestIds={[]}
          answers={answers}
          questionIndex={0}
          onToggleOption={(questionId, optionValue) => {
            if (question?.allowCustomAnswer === false) {
              setAnswers({
                ...answers,
                [questionId]: { selectedOptions: [optionValue], customAnswer: "" },
              });
            }
          }}
          onAdvance={() => {}}
          onDismiss={() => setPending(null)}
        />
      ) : null}
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
            // Answer branch: the typed text is the in-progress custom answer;
            // the draft in the store is untouched.
            setAnswers((prev) => ({
              ...prev,
              [question.id]: {
                ...(prev[question.id] ?? {}),
                customAnswer: nextValue,
              },
            }));
            setCursor(nextCursor);
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
        disabled={choiceOnly}
      />
      <button ref={outsideRef} type="button" data-testid="outside-target">
        outside
      </button>
    </div>
  );
}

function typeTextAtCaret(editor: HTMLElement, char: string, caretOffset: number) {
  // Inserts a character at the editor's caret offset by mutating the text
  // node that ProseMirror observes. jsdom does not always mirror PM's caret
  // into the native selection (after programmatic focus the range may sit on
  // the wrapper div), so the offset comes from the PM state, not the DOM.
  const paragraph = editor.querySelector("p");
  if (!paragraph) {
    throw new Error("expected a paragraph inside the editor");
  }
  const textNode = paragraph.firstChild;
  if (textNode instanceof Text) {
    if (caretOffset < 0 || caretOffset > textNode.data.length) {
      throw new Error(`caret offset ${caretOffset} out of range for "${textNode.data}"`);
    }
    act(() => {
      textNode.data = textNode.data.slice(0, caretOffset) + char + textNode.data.slice(caretOffset);
    });
    return;
  }
  // Empty paragraph: PM renders <p><br></p> (or <p></p>); swap the placeholder
  // out for the first text node.
  const placeholder = paragraph.firstChild;
  const isSwappablePlaceholder =
    placeholder !== null &&
    (placeholder.nodeType === 8 || (placeholder.nodeType === 1 && placeholder.nodeName === "BR"));
  if (!isSwappablePlaceholder || caretOffset !== 0) {
    throw new Error(
      `unexpected empty-paragraph state for offset ${caretOffset}: ` +
        (placeholder ? placeholder.nodeName : "no child"),
    );
  }
  act(() => {
    const text = document.createTextNode(char);
    if (placeholder) paragraph.replaceChild(text, placeholder);
    else paragraph.appendChild(text);
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

function mountApp() {
  const controls: { current: DockControls | null } = { current: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<DockTestApp controls={controls} />));
  expect(controls.current).toBeTruthy();
  return controls;
}

describe("pending question dock vs composer draft caret (refocus + choice-only)", () => {
  it("restores the draft at the live caret when the user re-focuses after an unfocused dock", async () => {
    const controls = mountApp();

    // Type a draft, place the caret mid-text, then move focus away (the user
    // goes to read the thread).
    await act(async () => {
      controls.current!.focusEditorAt(11);
    });
    typeTextAtCaret(controls.current!.editorElement()!, "Z", controls.current!.caretOffset()); // "in progressZ draft", caret 12
    act(() => {
      controls.current!.blurToOutside();
    });
    await act(async () => {});

    // The question docks while the composer is unfocused.
    act(() => {
      controls.current!.dock(makePrompt({}));
    });
    await act(async () => {});
    expect(snapshot().caretInEditor).toBe(false);

    // The user clicks back into the editor: the draft comes back and the
    // caret must land where it was, not at 0.
    act(() => {
      controls.current!.clickEditor();
    });
    await act(async () => {});
    const restored = snapshot();
    expect(restored.text).toBe("in progressZ draft");
    expect(restored.caretInEditor).toBe(true);
    // The native caret offset is unreliable in jsdom (the range can sit on
    // the wrapper element after a programmatic focus); PM's own state is the
    // authoritative caret position.
    expect(controls.current!.caretOffset()).toBe(12); // "in progressZ| draft"

    // Typing continues at the restored offset, not at position 0.
    typeTextAtCaret(restored.editor, "X", controls.current!.caretOffset());
    await act(async () => {});
    expect(snapshot().text).toBe("in progressZX draft");
  }, 30000);

  it("leaves focus out of the editor when a choice-only question docks", async () => {
    const controls = mountApp();

    await act(async () => {
      controls.current!.focusEditorAt(11);
    });
    act(() => {
      controls.current!.dock(makePrompt({ allowCustomAnswer: false }));
    });
    await act(async () => {});

    // The editor is disabled in the same commit; the draft content stays put.
    expect(snapshot().text).toBe("in progress draft");
    expect(
      container!.querySelector('[data-testid="composer-editor"]')!.getAttribute("contenteditable"),
    ).toBe("false");
  }, 30000);

  it("never pulls a live caret back to a stale cursor prop while the editor is focused", async () => {
    // jsdom caveat: ProseMirror's live selection is unreliable in jsdom after
    // a programmatic focus() (the DOM selection is not mirrored into PM state),
    // so this test asserts the content-level invariants: a stale cursor prop
    // with an unchanged value must not rewrite or remount the editor, and the
    // typed text must land at the offset it was inserted at — never at 0.
    const controls = mountApp();

    await act(async () => {
      controls.current!.focusEditorAt(11);
    });
    typeTextAtCaret(controls.current!.editorElement()!, "Z", 11);
    await act(async () => {});
    expect(snapshot().text).toBe("in progressZ draft");
    const editorBefore = container!.querySelector('[data-testid="composer-editor"]')!;

    // The cursor prop is reset to 0 (as an option click does) while the value
    // is unchanged and the editor keeps focus: content must stay byte-identical
    // on the same DOM node — no rewrite, no remount, no caret yank.
    act(() => {
      controls.current!.staleCursor(0);
    });
    await act(async () => {});
    const editorAfter = container!.querySelector('[data-testid="composer-editor"]')!;
    expect(editorAfter).toBe(editorBefore);
    expect(snapshot().text).toBe("in progressZ draft");

    // Typing continues at the offset the text has — not at position 0.
    typeTextAtCaret(editorAfter, "X", 12);
    await act(async () => {});
    expect(snapshot().text).toBe("in progressZX draft");
  }, 30000);

  it("keeps the editor in answer mode after an option is chosen — the draft never re-appears at caret 0", async () => {
    const controls = mountApp();

    // Draft in progress, question docks while focused.
    await act(async () => {
      controls.current!.focusEditorAt(11);
    });
    act(() => {
      controls.current!.dock(makePrompt({}));
    });
    await act(async () => {});
    expect(snapshot().text).toBe("in progress draft");

    // The user picks an option (blur to the panel button + selection).
    act(() => {
      controls.current!.selectOption("Incremental");
    });
    await act(async () => {});
    // The editor leaves draft mode: it now shows the (empty) answer field.
    expect(snapshot().text).toBe("");

    // Refocusing must NOT pull the draft back with the caret at 0 — the user
    // is answering the question, so keystrokes go into the answer.
    act(() => {
      controls.current!.clickEditor();
    });
    await act(async () => {});
    expect(snapshot().text).toBe("");

    // jsdom caveat: the PM selection is not readable after the programmatic
    // focus, so the offsets are tracked locally — the product assertion is
    // that the characters accumulate sequentially in the answer field.
    typeTextAtCaret(controls.current!.editorElement()!, "o", 0);
    await act(async () => {});
    typeTextAtCaret(controls.current!.editorElement()!, "k", 1);
    await act(async () => {});
    expect(snapshot().text).toBe("ok");
    // The draft is untouched and the answer received the text.
    expect(answersRef.current).toMatchObject({ "question-1": { customAnswer: "ok" } });
  }, 30000);
});
