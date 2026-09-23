import { describe, expect, it } from "vite-plus/test";

import {
  isEditingComposerDraft,
  resolveComposerPromptEditorValue,
  type ComposerDraftAnswerState,
} from "./composerDraftAnswerState";

function state(overrides: Partial<ComposerDraftAnswerState> = {}): ComposerDraftAnswerState {
  return {
    isComposerApprovalState: false,
    activePendingCustomAnswer: "", // a pending question is docked, no answer typed yet
    draft: "my in-progress draft",
    isComposerFocused: true,
    ...overrides,
  };
}

describe("resolveComposerPromptEditorValue", () => {
  it("keeps the draft in the editor when a question docks while the user is focused mid-typing", () => {
    expect(resolveComposerPromptEditorValue(state())).toBe("my in-progress draft");
  });

  it("shows the in-progress answer once the user stops composing the draft (loses focus)", () => {
    expect(resolveComposerPromptEditorValue(state({ isComposerFocused: false }))).toBe("");
  });

  it("shows the in-progress answer once a custom answer has been started", () => {
    expect(
      resolveComposerPromptEditorValue(state({ activePendingCustomAnswer: "typed answer" })),
    ).toBe("typed answer");
  });

  it("shows the in-progress answer when the draft is empty (nothing to preserve)", () => {
    expect(resolveComposerPromptEditorValue(state({ draft: "   " }))).toBe("");
  });

  it("shows the draft when no question is docked", () => {
    expect(resolveComposerPromptEditorValue(state({ activePendingCustomAnswer: null }))).toBe(
      "my in-progress draft",
    );
  });

  it("shows an empty editor in approval state regardless of the draft", () => {
    expect(resolveComposerPromptEditorValue(state({ isComposerApprovalState: true }))).toBe("");
  });
});

describe("isEditingComposerDraft", () => {
  it("is true only while the user is focused in a non-empty draft with no answer started", () => {
    expect(isEditingComposerDraft(state())).toBe(true);
    expect(isEditingComposerDraft(state({ isComposerFocused: false }))).toBe(false);
    expect(isEditingComposerDraft(state({ draft: "" }))).toBe(false);
    expect(isEditingComposerDraft(state({ activePendingCustomAnswer: "x" }))).toBe(false);
    expect(isEditingComposerDraft(state({ activePendingCustomAnswer: null }))).toBe(false);
    expect(isEditingComposerDraft(state({ isComposerApprovalState: true }))).toBe(false);
  });
});
