import type { ReactNode } from "react";

/**
 * A titled group of picker rows with a sticky header. Shared by the repository and Jira project
 * pickers so both read as one component family.
 *
 * The sticky header paints over the rows scrolling beneath it, so it is a (near-)opaque card
 * surface rather than transparent. No backdrop blur: at 95% opacity it adds nothing, and a
 * filtered layer over a scroller is what can drop the label from a capture or a slow compositor.
 */
export function PickerSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pb-1">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-2.5 py-1.5">
        <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
          {count !== undefined ? <span className="ml-1.5 opacity-60">{count}</span> : null}
        </h3>
        {action}
      </div>
      <ul>{children}</ul>
    </section>
  );
}
