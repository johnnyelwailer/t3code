import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Rows of the t3team project sidebar. They are the feature's own controls rather than
 * upstream's SidebarMenuButton / SidebarMenuSubButton: a row hosts actions overlaid on its
 * end and stays highlighted while the pointer is on them (`hoverGroup` names the wrapper's
 * group), and rows hover on the accent surface; a selected row (`isActive`) takes upstream's
 * selected-row surface in medium weight. They keep upstream's `data-sidebar`
 * attributes, so sidebar selectors and tests still treat them as menu (sub) buttons.
 */
const t3SidebarRowVariants = cva(
  "flex w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-left outline-hidden ring-ring focus-visible:ring-2 active:bg-sidebar-row-active active:text-sidebar-foreground data-[active=true]:bg-sidebar-row-selected data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      /** `item` heads a project; `sub` rows sit in a sub list beneath it. */
      level: {
        item: "font-medium text-sidebar-muted-foreground/80 transition-[width,height,padding] [&>svg]:text-(--sidebar-icon-color) hover:[&>svg]:text-sidebar-foreground",
        sub: "text-sidebar-foreground [&>svg]:text-sidebar-muted-foreground",
      },
      size: {
        micro: "h-6 text-3xs",
        xs: "h-7 text-2xs",
        sm: "h-7 text-xs",
        /** One line that grows when the row carries a second (status) line. */
        fit: "h-auto min-h-7 py-1 text-xs",
        /** Two stacked lines: an id/title line over a muted detail line. */
        "two-line": "h-auto min-h-8 flex-col items-start py-1 text-xs",
      },
      tone: {
        default: "hover:bg-accent hover:text-foreground",
        /** Upstream's own sidebar-row hover, for rows that are never selected. */
        rail: "hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        muted: "text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80",
      },
      hoverGroup: {
        none: "",
        "project-header":
          "group-hover/project-header:bg-accent group-hover/project-header:text-foreground group-focus-within/project-header:bg-accent group-focus-within/project-header:text-foreground",
        "my-work-row":
          "group-hover/my-work-row:bg-accent group-hover/my-work-row:text-foreground group-focus-within/my-work-row:bg-accent group-focus-within/my-work-row:text-foreground",
        "pinned-ticket":
          "group-hover/pinned-ticket:bg-accent group-hover/pinned-ticket:text-foreground group-focus-within/pinned-ticket:bg-accent group-focus-within/pinned-ticket:text-foreground",
        "ticket-card":
          "group-hover/ticket-card:bg-accent group-hover/ticket-card:text-foreground group-focus-within/ticket-card:bg-accent group-focus-within/ticket-card:text-foreground",
      },
    },
  },
);

type RowVariantProps = Omit<VariantProps<typeof t3SidebarRowVariants>, "level"> & {
  isActive?: boolean | undefined;
};

function rowProps(
  level: "item" | "sub",
  { size = "sm", tone = "default", hoverGroup = "none", isActive = false }: RowVariantProps,
  className: string | undefined,
) {
  const slot = level === "item" ? "menu-button" : "menu-sub-button";
  return {
    className: cn(t3SidebarRowVariants({ level, size, tone, hoverGroup }), className),
    "data-active": isActive,
    "data-sidebar": slot,
    "data-size": size,
    "data-slot": `sidebar-${slot}`,
  };
}

/** A project heading row: a button, like upstream's SidebarMenuButton. */
export function T3SidebarRow({
  size,
  tone,
  hoverGroup,
  isActive,
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & RowVariantProps) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      rowProps("item", { size, tone, hoverGroup, isActive }, className),
      props,
    ),
    render,
  });
}

/** A row in a sub list: an anchor, like upstream's SidebarMenuSubButton, so it can host
 * the row's own action buttons. */
export function T3SidebarSubRow({
  size,
  tone,
  hoverGroup,
  isActive,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & RowVariantProps) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(rowProps("sub", { size, tone, hoverGroup, isActive }, className), props),
    render,
  });
}

/**
 * The project sidebar's nested list: upstream's SidebarMenuSub rail, packed tighter
 * (half the row gap, a narrower inset) because it nests up to three levels deep.
 */
export function T3SidebarSubList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex min-w-0 flex-col gap-0.5 border-sidebar-border border-l px-1.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}
