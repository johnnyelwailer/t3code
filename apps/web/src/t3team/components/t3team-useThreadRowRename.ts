import { useCallback, useRef, useState } from "react";

/**
 * Inline-rename state for a sidebar thread row.
 *
 * Its own hook because it is a small state machine with one non-obvious rule: submitting an empty
 * or unchanged title RESTORES the current title rather than committing it, so a stray Enter cannot
 * blank a thread's name. Keeping that beside the row's rendering made both harder to read.
 */
export function useThreadRowRename(input: {
  readonly title: string;
  readonly onRename: (next: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(input.title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = useCallback(() => {
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== input.title) input.onRename(trimmed);
    else setRenameTitle(input.title);
    setIsRenaming(false);
  }, [renameTitle, input]);

  return { isRenaming, setIsRenaming, renameTitle, setRenameTitle, inputRef, submit };
}
