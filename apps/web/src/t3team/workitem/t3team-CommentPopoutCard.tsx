/**
 * The one inline "leave a note" popout used across the work item surfaces.
 *
 * It was born as the body of `T3TeamDiffSelectionComposer` (feedback on a selected passage of a
 * proposed description). The description header's `Rewrite` control needs the same affordance with
 * no quote to anchor to, so the card was extracted rather than copied: the two must not drift into
 * two visual languages for the same act, and both feed the same `describe-rewrite` workflow input.
 *
 * Purely presentational and purely local — mounting it costs nothing, which is the point of the
 * `Rewrite` entry point (no thread, no launch, no model until the human has said something).
 *
 * Colour comes from semantic tokens only (`popover`, `border`, `primary`, `muted-foreground`), so
 * light and dark follow the theme.
 */

import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";

export function T3TeamCommentPopoutCard({
  quote,
  placeholder = "What should change here?",
  submitLabel = "Comment",
  ariaLabel = "Comment on the selected text",
  onSubmit,
  onCancel,
}: {
  /** The passage the note is anchored to. Omitted when the note is about the whole field. */
  readonly quote?: string | undefined;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly ariaLabel?: string;
  readonly onSubmit: (body: string) => void;
  readonly onCancel: () => void;
}) {
  const [body, setBody] = useState("");

  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-lg">
      {quote ? (
        <p className="mb-1.5 line-clamp-2 border-l-2 border-primary/50 pl-2 text-[11px] italic text-muted-foreground">
          {quote}
        </p>
      ) : null}
      <Textarea
        autoFocus
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        className="text-xs"
        aria-label={ariaLabel}
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={body.trim() === ""} onClick={() => onSubmit(body)}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
