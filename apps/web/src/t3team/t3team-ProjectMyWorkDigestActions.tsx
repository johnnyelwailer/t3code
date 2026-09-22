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
 * The row's next-step cluster, pinned to the row's bottom-right corner and revealed on hover.
 * The agent dots live on the left-side PR row, so this corner is theirs alone. Absolutely
 * positioned, so it never shifts the row's layout. Fades and slides in instead of popping;
 * always visible on small screens, which have no hover.
 */
export function DigestItemActions({ actions }: { actions: readonly DigestItemAction[] }) {
  if (actions.length === 0) return null;
  return (
    <span className="pointer-events-none absolute bottom-1 right-3 z-10 flex translate-y-1 items-center gap-1.5 rounded-lg bg-background/95 p-1 opacity-0 shadow-sm ring-1 ring-border/60 transition-[opacity,transform] duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 max-sm:pointer-events-auto max-sm:translate-y-0 max-sm:opacity-100">
      {actions.map((action) => (
        <DigestActionPill key={action.label} action={action} />
      ))}
    </span>
  );
}
