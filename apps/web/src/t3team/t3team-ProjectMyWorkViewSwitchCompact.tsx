import type { ProjectShellProject } from "@t3tools/project-context";
import { ChevronDownIcon } from "lucide-react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";

import type {
  ProjectMyWorkLens,
  ProjectMyWorkProjectSegment,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";

type LensItem = { readonly value: ProjectMyWorkLens; readonly label: string };

function activeLabel(input: {
  lens: ProjectMyWorkLens;
  lenses: ReadonlyArray<LensItem>;
  backlog?: ProjectMyWorkProjectSegment;
  planning?: ProjectMyWorkProjectSegment;
}): string {
  if (input.planning?.kind === "select" && input.planning.active) return "Planning";
  if (input.backlog?.kind === "select" && input.backlog.active) return "Backlog";
  return input.lenses.find((item) => item.value === input.lens)?.label ?? "List";
}

function ProjectItems({
  itemLabel,
  pickerLabel,
  segment,
}: {
  itemLabel: string;
  pickerLabel: string;
  segment: ProjectMyWorkProjectSegment;
}) {
  if (segment.kind === "select") {
    return (
      <MenuItem
        onClick={() => {
          if (!segment.active) segment.onSelect();
        }}
      >
        {itemLabel}
      </MenuItem>
    );
  }
  return (
    <MenuGroup>
      <MenuGroupLabel>{pickerLabel}</MenuGroupLabel>
      {segment.projects.length === 0 ? (
        <MenuItem disabled>No project with a backlog yet</MenuItem>
      ) : (
        segment.projects.map((project: ProjectShellProject) => (
          <MenuItem key={`${itemLabel}-${project.id}`} onClick={() => segment.onPick(project.id)}>
            {project.title}
          </MenuItem>
        ))
      )}
    </MenuGroup>
  );
}

/**
 * The lens switch as one control. Shown below the `sm` breakpoint (640px); the full tab row
 * stays on wider screens. Same callbacks, so the URL and the saved lens do not change.
 */
export function ProjectMyWorkViewSwitchCompact({
  lens,
  lenses,
  onLensChange,
  backlog,
  planning,
}: {
  lens: ProjectMyWorkLens;
  /** The lenses the host offers, in order. */
  lenses: ReadonlyArray<LensItem>;
  onLensChange: (value: ProjectMyWorkLens) => void;
  backlog?: ProjectMyWorkProjectSegment;
  planning?: ProjectMyWorkProjectSegment;
}) {
  return (
    <div className="sm:hidden">
      <Menu>
        <MenuTrigger
          aria-label="My Work view"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-input/40 px-2.5 text-xs font-medium text-foreground"
          render={<button type="button" />}
        >
          {activeLabel({
            lens,
            lenses,
            ...(backlog ? { backlog } : {}),
            ...(planning ? { planning } : {}),
          })}
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" className="min-w-56">
          {lenses.map((item) => (
            <MenuItem key={item.value} onClick={() => onLensChange(item.value)}>
              {item.label}
            </MenuItem>
          ))}
          {backlog ? (
            <ProjectItems itemLabel="Backlog" pickerLabel="Backlog of…" segment={backlog} />
          ) : null}
          {planning ? (
            <ProjectItems
              itemLabel="Planning"
              pickerLabel="Planning space of…"
              segment={planning}
            />
          ) : null}
        </MenuPopup>
      </Menu>
    </div>
  );
}
