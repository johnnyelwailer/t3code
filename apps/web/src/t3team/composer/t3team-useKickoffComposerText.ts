import { useCallback, useEffect, useRef, useState } from "react";

import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditorTiptap";
import {
  readKickoffComposerDraft,
  writeKickoffComposerDraft,
} from "~/t3team/composer/t3team-kickoffComposerDraft";

/**
 * Kickoff composer text state: the draft text with its collapsed cursor, kept
 * in sync with an externally supplied prefill, plus the editor handle used to
 * focus the draft when a recipe chip mounts.
 *
 * With a `draftKey`, the text is restored on mount and written through to
 * storage on every change, so a reload or forced app restart keeps it. A
 * prefill (an explicit recipe/quick-start action) wins over a stored draft.
 */
export function useT3TeamKickoffComposerText(input: {
  readonly prefillText: string | undefined;
  readonly hasSelectedRecipe: boolean;
  readonly draftKey?: string | null;
}) {
  const draftKey = input.draftKey ?? null;
  // Lazy: storage is read once on mount, not on every keystroke render.
  const [initialText] = useState(
    () => input.prefillText ?? readKickoffComposerDraft(draftKey) ?? "",
  );
  const [text, setTextState] = useState(initialText);
  const [cursor, setCursor] = useState(initialText.length);
  const [loadedDraftKey, setLoadedDraftKey] = useState(draftKey);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const prefillText = input.prefillText;
  const hasSelectedRecipe = input.hasSelectedRecipe;

  // Same component, different surface (e.g. another ticket): show that surface's draft.
  if (loadedDraftKey !== draftKey) {
    const restored = readKickoffComposerDraft(draftKey) ?? "";
    setLoadedDraftKey(draftKey);
    setTextState(restored);
    setCursor(restored.length);
  }

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      writeKickoffComposerDraft(draftKey, next);
    },
    [draftKey],
  );

  useEffect(() => {
    if (prefillText !== undefined) {
      setText(prefillText);
      setCursor(prefillText.length);
    }
  }, [prefillText, setText]);

  useEffect(() => {
    if (hasSelectedRecipe) {
      editorRef.current?.focusAtEnd();
    }
  }, [hasSelectedRecipe]);

  return { text, cursor, editorRef, setText, setCursor };
}
