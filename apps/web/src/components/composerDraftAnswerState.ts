export interface ComposerDraftAnswerState {
  readonly isComposerApprovalState: boolean;
  /** The pending question's in-progress custom answer, or `null` when no question is pending. */
  readonly activePendingCustomAnswer: string | null;
  /** The composer's in-progress draft (the `prompt` state). */
  readonly draft: string;
  /** Whether the prompt editor is the focused element. */
  readonly isComposerFocused: boolean;
}

/**
 * A docked pending question repurposes the prompt editor as the answer field —
 * but only once the user is actually answering it. While the user is still
 * focused in an in-progress draft and has not started the answer (no custom
 * answer typed yet), the editor keeps editing that draft, so the moment a
 * question docks the draft is not pulled from under the caret and the editor
 * is not re-mounted/rewritten.
 *
 * The composer leaves this "draft" state when the user stops composing it: by
 * losing focus, emptying the draft, or starting the answer (a custom answer
 * gets typed / an option is chosen, which clears the editor).
 */
export function isEditingComposerDraft(input: ComposerDraftAnswerState): boolean {
  if (input.isComposerApprovalState) return false;
  const answer = input.activePendingCustomAnswer;
  if (answer === null) return false;
  return input.isComposerFocused && input.draft.trim() !== "" && answer === "";
}

/**
 * The controlled value shown in the prompt editor.
 *
 * - Approval state always shows an empty editor.
 * - With no pending question it shows the draft.
 * - With a pending question it shows the in-progress answer — except while the
 *   user is still composing their draft (see {@link isEditingComposerDraft}),
 *   in which case the draft stays so docking the question is non-disruptive.
 */
export function resolveComposerPromptEditorValue(input: ComposerDraftAnswerState): string {
  if (input.isComposerApprovalState) return "";
  const answer = input.activePendingCustomAnswer;
  if (answer === null) return input.draft;
  return isEditingComposerDraft(input) ? input.draft : answer;
}
