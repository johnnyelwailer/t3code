import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { cn } from "~/t3team/lib/t3team-utils";

/**
 * Placeholder for content that has not arrived yet.
 *
 * Used instead of a spinner and instead of the previous "Loading ticket details..." card. A skeleton
 * holds the space the real content will occupy, so the page does not jump when it lands, and it says
 * what is happening without a sentence saying it.
 *
 * Only shown on first load. A refresh keeps the existing content on screen — replacing something
 * readable with a placeholder is a downgrade.
 */
export function WorkItemSkeleton({
  lines = 3,
  className,
}: {
  readonly lines?: number;
  readonly className?: string;
}) {
  // Varied widths so the block reads as prose rather than a bar chart; last line always shortest.
  const widths = ["100%", "96%", "88%", "92%", "70%"];

  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Skeleton
          key={index}
          className="h-3.5 rounded"
          style={{ width: index === lines - 1 ? "58%" : widths[index % widths.length] }}
        />
      ))}
    </div>
  );
}
