import type { MouseEvent } from "react";

import type { DigestItemAction } from "~/t3team/t3team-projectMyWorkDigestPlan";

/**
 * One next-step button on a digest row. Solid border = plain link (thread / PR / CI);
 * dashed border = recipe starter, i.e. it would launch a workflow instead of opening a page.
 */
function DigestActionPill({ action }: { action: DigestItemAction }) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const cls = `shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium leading-none text-foreground/85 hover:bg-accent ${
    action.recipe ? "border-dashed border-border" : "border-border/70"
  }`;
  return action.href ? (
    <a href={action.href} target="_blank" rel="noreferrer" className={cls} onClick={stop}>
      {action.label}
    </a>
  ) : (
    <button type="button" className={cls} onClick={stop}>
      {action.label}
    </button>
  );
}

/**
 * The row's next-step cluster: its own line at the bottom of the row, right-aligned and revealed
 * on hover or keyboard focus. It is IN the row's flow (never absolutely positioned), so it can
 * not cover the PR chips or the why-text; the space is reserved so revealing it does not shift
 * the list. Wraps instead of overflowing on a narrow lane; always visible on small screens,
 * which have no hover (including touch screens wider than `sm`).
 */
export function DigestItemActions({ actions }: { actions: readonly DigestItemAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="pointer-events-none mt-1.5 flex min-w-0 flex-wrap items-center justify-end gap-1.5 opacity-0 transition-opacity duration-150 ease-out group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      {actions.map((action) => (
        <DigestActionPill key={action.label} action={action} />
      ))}
    </div>
  );
}
