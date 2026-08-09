import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { CommentBodyEditor } from "~/t3team/workitem/t3team-CommentBodyEditor";

/** The inline "edit this comment" form — the same `CommentBodyEditor` the composer uses, since ADF
 * editing is out of scope for this slice (bodies stay plain-text-to-ADF on write) but that's no
 * reason to hand-roll a second, plainer text field for the same content type. */
export function WorkItemCommentEditForm({
  initialBody,
  pending,
  onSave,
  onCancel,
}: {
  readonly initialBody: string;
  readonly pending: boolean;
  readonly onSave: (body: string) => void;
  readonly onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [cursor, setCursor] = useState(initialBody.length);

  return (
    <div
      className="space-y-1.5"
      onKeyDown={(event) => {
        // `CommentBodyEditor` only exposes Enter/Tab/Arrow keys through `onCommandKeyDown` — Escape
        // is caught here instead, on the wrapping element the keydown still bubbles to.
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <CommentBodyEditor
        value={body}
        cursor={cursor}
        onChange={(nextValue, nextCursor) => {
          setBody(nextValue);
          setCursor(nextCursor);
        }}
        onSubmit={() => onSave(body.trim())}
        disabled={pending}
        placeholder="Edit comment… (⌘/Ctrl + Enter to save)"
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={pending || !body.trim()}
          onClick={() => onSave(body.trim())}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
