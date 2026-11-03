import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { describeRichChoicePosition, type RichChoiceOption } from "./t3team-richChoice.logic";

/** Previous / dots / next: a pointer and keyboard route to every card, besides swiping. */
export function T3TeamRichChoiceControls({
  options,
  frontIndex,
  onGoTo,
}: {
  readonly options: readonly RichChoiceOption[];
  readonly frontIndex: number;
  /** `focus: "dot"` hands focus to the new current dot (an arrow that just disabled itself). */
  readonly onGoTo: (index: number, focus?: "dot" | null) => void;
}) {
  const count = options.length;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        size="icon"
        variant="outline"
        aria-label="Previous"
        disabled={frontIndex === 0}
        onClick={() => onGoTo(frontIndex - 1, frontIndex - 1 === 0 ? "dot" : null)}
      >
        <ArrowLeftIcon />
      </Button>
      <div role="group" aria-label="Choices" className="flex items-center gap-1.5">
        {options.map((option, position) => (
          <button
            key={option.id}
            type="button"
            data-rc-dot={position}
            aria-current={position === frontIndex ? "true" : undefined}
            aria-label={describeRichChoicePosition(position, count, option.title)}
            className={cn(
              "h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:duration-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              position === frontIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
            )}
            onClick={() => onGoTo(position)}
          />
        ))}
      </div>
      <Button
        size="icon"
        variant="outline"
        aria-label="Next"
        disabled={frontIndex === count - 1}
        onClick={() => onGoTo(frontIndex + 1, frontIndex + 1 === count - 1 ? "dot" : null)}
      >
        <ArrowRightIcon />
      </Button>
    </div>
  );
}
