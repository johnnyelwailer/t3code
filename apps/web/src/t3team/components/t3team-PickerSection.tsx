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
  layout = "list",
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  /** `grid`: wrapping selectable cards. Its header scrolls with the cards: a sticky header over a
   * grid of tall cards is what read as "only the group title moves". */
  layout?: "list" | "grid";
  children: ReactNode;
}) {
  const grid = layout === "grid";
  return (
    <section className="pb-1">
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 ${
          grid ? "pt-3" : "sticky top-0 z-10 bg-card/95"
        }`}
      >
        <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
          {count !== undefined ? <span className="ml-1.5 opacity-60">{count}</span> : null}
        </h3>
        {action}
      </div>
      <ul
        className={
          grid
            ? "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 px-1.5 pb-1"
            : undefined
        }
      >
        {children}
      </ul>
    </section>
  );
}
