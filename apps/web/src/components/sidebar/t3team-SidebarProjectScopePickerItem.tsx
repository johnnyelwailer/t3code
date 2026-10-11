import { FolderIcon, PlusIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";

import { ComboboxItem } from "../ui/combobox";
import { JiraProjectGlyph } from "./t3team-SidebarProjectScopeJiraGlyph";
import { GroupIcon, addDisabledReason } from "./t3team-sidebarProjectScopePills.actions";
import type { ScopePickerEntry } from "./t3team-sidebarProjectScopePicker.logic";

function EntryIcon({ entry }: { entry: ScopePickerEntry }) {
  if (entry.kind === "all") return <FolderIcon className="size-4 shrink-0" />;
  return entry.item.kind === "app" ? (
    <GroupIcon group={entry.item.group} />
  ) : (
    <JiraProjectGlyph entry={entry.item.entry} />
  );
}

/** One picker row. A Jira project the app does not have yet reads italic with a plus. */
export function T3TeamSidebarProjectScopePickerItem({
  entry,
  onContextMenu,
}: {
  entry: ScopePickerEntry;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const add = entry.kind === "item" && entry.item.kind === "add";
  return (
    <ComboboxItem
      hideIndicator
      value={entry}
      disabled={add && Boolean(addDisabledReason)}
      title={add ? addDisabledReason : undefined}
      onContextMenu={onContextMenu}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center">
        <EntryIcon entry={entry} />
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", add && "italic")}>{entry.label}</span>
      {add ? <PlusIcon aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
    </ComboboxItem>
  );
}
