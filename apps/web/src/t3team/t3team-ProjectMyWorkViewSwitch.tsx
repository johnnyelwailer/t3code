import type { ProjectShellProject } from "@t3tools/project-context";
import { Columns3, ListTodo, ListTree, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";

export type ProjectMyWorkLens = "digest" | "hierarchy" | "board";

type IconComponent = ComponentType<{ className?: string }>;

const LENSES: ReadonlyArray<{ value: ProjectMyWorkLens; label: string; Icon: IconComponent }> = [
  { value: "digest", label: "Digest", Icon: Sparkles },
  { value: "hierarchy", label: "List", Icon: ListTree },
  { value: "board", label: "Board", Icon: Columns3 },
];

/**
 * How the Backlog segment behaves. A project dashboard already knows its project, so it just
 * selects; the all-projects view has no project in hand and asks which one first (a backlog is
 * one project's hierarchy plus its own Jira planning, so several are never flattened together).
 */
export type ProjectMyWorkBacklogSegment =
  | { readonly kind: "select"; readonly active: boolean; readonly onSelect: () => void }
  | {
      readonly kind: "pick-project";
      readonly projects: ReadonlyArray<ProjectShellProject>;
      readonly onPick: (projectId: string) => void;
    };

const SEGMENT_BASE =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors";

function segmentClassName(active: boolean): string {
  return `${SEGMENT_BASE} ${
    active
      ? "bg-background text-foreground shadow-xs"
      : "text-muted-foreground hover:text-foreground"
  }`;
}

function SegmentLabel({ Icon, label }: { Icon: IconComponent; label: string }) {
  return (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="max-sm:sr-only">{label}</span>
    </>
  );
}

function BacklogProjectPicker({
  projects,
  onPick,
}: {
  projects: ReadonlyArray<ProjectShellProject>;
  onPick: (projectId: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        data-segment="backlog"
        className={segmentClassName(false)}
        render={<button type="button" />}
      >
        <SegmentLabel Icon={ListTodo} label="Backlog" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="end" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel>Backlog of…</MenuGroupLabel>
          {projects.length === 0 ? (
            <MenuItem disabled>No project with a backlog yet</MenuItem>
          ) : (
            projects.map((project) => (
              <MenuItem key={project.id} onClick={() => onPick(project.id)}>
                {project.title}
              </MenuItem>
            ))
          )}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * The My Work lens switch and, when `backlog` is given, the Backlog view as one segmented control:
 * Digest | List | Board | Backlog. Lives in the dashboard header.
 */
export function ProjectMyWorkViewSwitch({
  lens,
  onLensChange,
  backlog,
}: {
  lens: ProjectMyWorkLens;
  onLensChange: (value: ProjectMyWorkLens) => void;
  backlog?: ProjectMyWorkBacklogSegment;
}) {
  const backlogActive = backlog?.kind === "select" && backlog.active;
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-input/40 p-0.5"
      role="group"
      aria-label="My Work view switch"
    >
      {LENSES.map(({ value, label, Icon }) => {
        const active = !backlogActive && lens === value;
        return (
          <button
            key={value}
            type="button"
            data-segment={value}
            aria-pressed={active}
            onClick={() => onLensChange(value)}
            className={segmentClassName(active)}
          >
            <SegmentLabel Icon={Icon} label={label} />
          </button>
        );
      })}
      {backlog?.kind === "select" ? (
        <button
          type="button"
          data-segment="backlog"
          aria-pressed={backlog.active}
          onClick={() => {
            if (!backlog.active) backlog.onSelect();
          }}
          className={segmentClassName(backlog.active)}
        >
          <SegmentLabel Icon={ListTodo} label="Backlog" />
        </button>
      ) : backlog?.kind === "pick-project" ? (
        <BacklogProjectPicker projects={backlog.projects} onPick={backlog.onPick} />
      ) : null}
    </div>
  );
}
