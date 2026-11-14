import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { formatReleaseAge } from "./t3team-releaseAge";
import type { AppUpdateNotesView } from "./t3team-nexiUpdateNotice.logic";

/** The pill's notes popover while the flag is on: the dialog's notes list under the version. */
export function UpdatePopoverNotes({
  title,
  view,
  action,
  children,
}: {
  readonly title: string;
  readonly view: AppUpdateNotesView;
  readonly action?: {
    readonly label: string;
    readonly disabled: boolean;
    readonly onClick: () => void;
  };
  readonly children: ReactNode;
}) {
  return (
    <div className="flex max-w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 px-1 pb-1 text-left text-pretty">
      <div>
        <div className="text-sm leading-5 font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
          {view.releasedAt
            ? `${view.version} · ${formatReleaseAge(view.releasedAt)}`
            : view.version}
        </div>
      </div>
      {children}
      {action ? (
        <div className="flex justify-end">
          <Button size="xs" disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
