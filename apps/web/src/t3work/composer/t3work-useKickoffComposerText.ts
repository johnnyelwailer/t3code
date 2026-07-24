import { useEffect, useRef, useState } from "react";

import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";

/**
 * Kickoff composer text state: the draft text with its collapsed cursor, kept
 * in sync with an externally supplied prefill, plus the editor handle used to
 * focus the draft when a recipe chip mounts.
 */
export function useT3workKickoffComposerText(input: {
  readonly prefillText: string | undefined;
  readonly hasSelectedRecipe: boolean;
}) {
  const [text, setText] = useState(input.prefillText ?? "");
  const [cursor, setCursor] = useState((input.prefillText ?? "").length);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const prefillText = input.prefillText;
  const hasSelectedRecipe = input.hasSelectedRecipe;

  useEffect(() => {
    if (prefillText !== undefined) {
      setText(prefillText);
      setCursor(prefillText.length);
    }
  }, [prefillText]);

  useEffect(() => {
    if (hasSelectedRecipe) {
      editorRef.current?.focusAtEnd();
    }
  }, [hasSelectedRecipe]);

  return { text, cursor, editorRef, setText, setCursor };
}
