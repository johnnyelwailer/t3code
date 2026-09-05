/**
 * The workflow card's headline and demoted slug chip — split out of
 * `t3team-messageShapeCard.tsx` (both {@link ./t3team-messageShapeCard.tsx}'s static card and
 * {@link ./t3team-messageShapeCardLive.tsx}'s live card share it) to keep both files under the
 * prefixed-file LOC ceiling.
 */
import type { ProjectRecipeWorkflowShapePayload } from "@t3tools/project-recipes";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";

/**
 * The slug identifier, demoted beside the headline (see `T3TeamWorkflowCardHeadline`) — plain
 * muted monospace text, not a bordered/filled chip: it should recede rather than read as a
 * control with visual weight comparable to a button. Still visible, copyable, and truncation-
 * guarded (via `title`) so a long slug cannot push the headline around.
 *
 * Bounded in CHARACTERS, not as a percentage of its parent. `max-w-[45%]` measured 41px live,
 * because the percentage resolves against the slug's own narrow flex row (90px when the run has no
 * status text beside it) rather than the card — so `qa-report-shape` rendered as `qa-re…` with half
 * the row left empty. A ch bound tracks the thing actually being clamped: this is monospace, so
 * ~24ch is a readable slug, and anything longer still truncates with its `title` intact. The
 * headline sits on its own row above and cannot be pushed around by this either way.
 */
export function T3TeamWorkflowNameChip({ name }: { name: string }) {
  return (
    <span
      className="min-w-0 max-w-[24ch] truncate font-mono text-[10px] text-muted-foreground/70"
      title={name}
    >
      {name}
    </span>
  );
}

/**
 * The card's headline: `description` (the human sentence) leads when present, with `name` (the
 * machine slug) demoted beside it; a recipe with no `description` falls back to `name` as the
 * headline alone (never an empty header, and never the slug shown twice).
 *
 * A description can be a full sentence, so it clamps to two lines rather than one — one line
 * plus a native `title` tooltip proved unreadable for anything longer than a few words (a native
 * tooltip is slow, non-discoverable, and does not exist on touch at all). A real `Tooltip`
 * component still holds the untruncated text for the rare case two lines is not enough.
 *
 * `showNameChip` defaults to true (the static card's one-row header: title + chip, nothing else
 * competing for width). The live card sets it false and places `T3TeamWorkflowNameChip` itself on
 * a second, muted meta row alongside the live status — three blocks sharing one row is what
 * caused the header to out-grow the card's own content in the first place.
 */
export function T3TeamWorkflowCardHeadline({
  shape,
  className,
  showNameChip = true,
}: {
  shape: Pick<ProjectRecipeWorkflowShapePayload, "name" | "description">;
  className?: string;
  showNameChip?: boolean;
}) {
  const headline = shape.description ?? (shape.name || undefined);
  if (!headline) return null;
  return (
    <div className={cn("flex min-w-0 flex-1 items-start gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground" />
          }
        >
          {headline}
        </TooltipTrigger>
        <TooltipPopup side="top" align="start" className="max-w-84">
          {headline}
        </TooltipPopup>
      </Tooltip>
      {showNameChip && shape.description && shape.name ? (
        <T3TeamWorkflowNameChip name={shape.name} />
      ) : null}
    </div>
  );
}
