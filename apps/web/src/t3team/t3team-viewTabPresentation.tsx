import { ListTodo, Ticket, type LucideIcon } from "lucide-react";

import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

/** One entry the right panel's "+" menu and empty launcher offer beside upstream's own. */
export type T3TeamAddSurfaceAction = {
  readonly label: string;
  readonly description?: string;
  readonly icon: LucideIcon;
  readonly shortcut: string;
  readonly available: boolean;
  readonly disabledReason: string;
  readonly onClick: () => void;
};

export function viewTargetIcon(target: T3TeamViewTarget): LucideIcon {
  return target.kind === "my-work" ? ListTodo : Ticket;
}

export function ViewTabIcon({ target }: { readonly target: T3TeamViewTarget }) {
  return target.kind === "my-work" ? (
    <ListTodo className="size-3 shrink-0" />
  ) : (
    <Ticket className="size-3 shrink-0" />
  );
}
