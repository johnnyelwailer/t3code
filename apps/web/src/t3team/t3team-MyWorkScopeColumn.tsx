/**
 * The All-projects My Work column, shared by every state of that screen — the startup gate's
 * greeting, the greeting while the project list assembles, and the loaded digest — so a hand-off
 * between them never changes the column's width or position. (The gate used to lay its greeting
 * out edge to edge while the digest sat in the centred scope column: on a widescreen the page
 * visibly collapsed inwards the moment content arrived.)
 */
import type { ReactNode } from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import { t3teamScopeContentWidthClass } from "~/t3team/t3team-scopeContentWidth";

export const myWorkScopeColumnClassName = `mx-auto flex w-full ${t3teamScopeContentWidthClass} flex-col gap-8 p-4 sm:p-6`;

export function MyWorkScopeColumn({ children }: { readonly children: ReactNode }) {
  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className={myWorkScopeColumnClassName}>{children}</div>
    </ScrollArea>
  );
}

const noop = () => {};
const NO_PROJECTS = { kind: "pick-project", projects: [], onPick: noop } as const;

/**
 * The view switch as it will look once My Work is up, drawn while it is not: same row height and
 * pixels above the greeting, so the greeting does not drop when the real switch arrives. Inert —
 * nothing it could open exists yet.
 */
export function MyWorkViewSwitchStandIn({ lens }: { readonly lens: ProjectMyWorkLens }) {
  return (
    <div inert aria-hidden>
      <ProjectMyWorkViewSwitch
        lens={lens}
        onLensChange={noop}
        backlog={NO_PROJECTS}
        planning={NO_PROJECTS}
      />
    </div>
  );
}
