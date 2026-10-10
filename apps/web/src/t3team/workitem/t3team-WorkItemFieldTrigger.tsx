import type { ComponentProps } from "react";

import { cn } from "~/t3team/lib/t3team-utils";

/**
 * The inline-editable value of a work item property (assignee, story points): borderless text that
 * highlights on hover and focus, bleeding its padding into the row so the value stays aligned with
 * its label. Pass it as a Popover/Menu trigger's `render` element; the trigger supplies the
 * behaviour, this supplies the look.
 */
export function WorkItemFieldTrigger({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "-mx-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 leading-none outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
