import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";

/** The inline "edit this comment" form — a plain-text textarea, since ADF editing is out of scope
 * for this slice (bodies stay plain-text-to-ADF on write). */
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

  return (
    <div className="space-y-1.5">
      <Textarea
        autoFocus
        value={body}
        disabled={pending}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
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
