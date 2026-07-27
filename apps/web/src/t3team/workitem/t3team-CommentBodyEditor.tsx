import { useRef } from "react";

import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";

/**
 * `ComposerPromptEditor` is built on Lexical's `PlainTextPlugin` with no default Enter handler
 * registered underneath ours (unlike the chat composer it's normally used in, which always claims
 * plain Enter for "send" and never needs a fallback) — returning `false` from `onCommandKeyDown`
 * for a plain Enter would make it a silent no-op instead of inserting a newline. So a newline is
 * spliced into the controlled value/cursor directly; `$appendTextWithLineBreaks` renders embedded
 * "\n"s as line breaks when the editor re-syncs its `value` prop. Exported standalone so the
 * splice arithmetic is unit-testable without mounting Lexical.
 */
export function spliceNewlineAtCursor(
  value: string,
  cursor: number,
): { readonly value: string; readonly cursor: number } {
  return { value: `${value.slice(0, cursor)}\n${value.slice(cursor)}`, cursor: cursor + 1 };
}

/**
 * The Lexical `ComposerPromptEditor` (see `TicketKickoffComposer.tsx` for the same
 * outside-chat-reuse pattern), wrapped once so the comment composer and the comment edit form share
 * one authoring surface instead of one reusing it and the other keeping a bare `<Textarea>`.
 * `terminalContexts`/`skills` are always empty — a Jira comment has nothing chat-side to mention —
 * but the @/$/ trigger infrastructure comes for free rather than needing a second editor.
 *
 * Fully controlled (`value`/`cursor`/`onChange`) rather than owning its own cursor state, so a
 * caller that clears its draft after a successful submit (the composer) doesn't fight a cursor
 * position this component invented independently.
 */
export function CommentBodyEditor({
  value,
  cursor,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: {
  readonly value: string;
  readonly cursor: number;
  readonly onChange: (nextValue: string, nextCursor: number) => void;
  readonly onSubmit: () => void;
  readonly disabled?: boolean;
  readonly placeholder: string;
}) {
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);

  return (
    <div className="rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] focus-within:ring-[3px] focus-within:ring-ring/24">
      <ComposerPromptEditor
        editorRef={editorRef}
        value={value}
        cursor={cursor}
        terminalContexts={[]}
        skills={[]}
        disabled={Boolean(disabled)}
        onRemoveTerminalContext={() => {}}
        onChange={onChange}
        onCommandKeyDown={(key, event) => {
          if (key !== "Enter") return false;
          if (event.metaKey || event.ctrlKey) {
            onSubmit();
            return true;
          }
          const next = spliceNewlineAtCursor(value, cursor);
          onChange(next.value, next.cursor);
          return true;
        }}
        onPaste={() => {}}
        placeholder={placeholder}
      />
    </div>
  );
}
