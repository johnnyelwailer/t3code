import type { ProjectShellProject } from "@t3tools/project-context";
import { Columns3, ListTodo, ListTree, Orbit, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { ProjectMyWorkViewSwitchCompact } from "~/t3team/t3team-ProjectMyWorkViewSwitchCompact";

export type ProjectMyWorkLens = "digest" | "hierarchy" | "board";

type IconComponent = ComponentType<{ className?: string }>;

const LENSES: ReadonlyArray<{ value: ProjectMyWorkLens; label: string; Icon: IconComponent }> = [
  { value: "digest", label: "Digest", Icon: Sparkles },
  { value: "hierarchy", label: "List", Icon: ListTree },
  { value: "board", label: "Board", Icon: Columns3 },
];

/**
 * How the Backlog and Planning segments behave. A project dashboard already knows its project, so
 * it just selects; the all-projects view has no project in hand and asks which one first (a
 * backlog is one project's hierarchy plus its own Jira planning, so several are never flattened
 * together; the planning space is the same backlog in another view).
 */
export type ProjectMyWorkProjectSegment =
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

/** The two segments that open a project's backlog: which view of it, under which name. */
const BACKLOG_SEGMENTS = {
  backlog: { label: "Backlog", Icon: ListTodo, pickerLabel: "Backlog of…" },
  planning: { label: "Planning", Icon: Orbit, pickerLabel: "Planning space of…" },
} as const;
type BacklogSegmentKey = keyof typeof BACKLOG_SEGMENTS;

function BacklogProjectPicker({
  segment,
  projects,
  onPick,
}: {
  segment: BacklogSegmentKey;
  projects: ReadonlyArray<ProjectShellProject>;
  onPick: (projectId: string) => void;
}) {
  const { label, Icon, pickerLabel } = BACKLOG_SEGMENTS[segment];
  return (
    <Menu>
      <MenuTrigger
        data-segment={segment}
        className={segmentClassName(false)}
        render={<button type="button" />}
      >
        <SegmentLabel Icon={Icon} label={label} />
      </MenuTrigger>
      <MenuPopup side="bottom" align="end" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel>{pickerLabel}</MenuGroupLabel>
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

function BacklogSegment({
  segment,
  behavior,
}: {
  segment: BacklogSegmentKey;
  behavior: ProjectMyWorkProjectSegment;
}) {
  if (behavior.kind === "pick-project") {
    return (
      <BacklogProjectPicker
        segment={segment}
        projects={behavior.projects}
        onPick={behavior.onPick}
      />
    );
  }
  const { label, Icon } = BACKLOG_SEGMENTS[segment];
  return (
    <button
      type="button"
      data-segment={segment}
      aria-pressed={behavior.active}
      onClick={() => {
        if (!behavior.active) behavior.onSelect();
      }}
      className={segmentClassName(behavior.active)}
    >
      <SegmentLabel Icon={Icon} label={label} />
    </button>
  );
}

/**
 * The My Work lens switch and, when `backlog` / `planning` are given, the two views of the Backlog
 * as one segmented control: Digest | List | Board | Backlog | Planning. Lives in the dashboard
 * header. Planning is the backlog's planning-space view.
 */
export function ProjectMyWorkViewSwitch({
  lens,
  onLensChange,
  backlog,
  planning,
}: {
  lens: ProjectMyWorkLens;
  onLensChange: (value: ProjectMyWorkLens) => void;
  backlog?: ProjectMyWorkProjectSegment;
  planning?: ProjectMyWorkProjectSegment;
}) {
  const backlogActive =
    (backlog?.kind === "select" && backlog.active) ||
    (planning?.kind === "select" && planning.active);
  return (
    <>
      <ProjectMyWorkViewSwitchCompact
        lens={lens}
        onLensChange={onLensChange}
        {...(backlog ? { backlog } : {})}
        {...(planning ? { planning } : {})}
      />
      <div
        className="hidden shrink-0 items-center gap-0.5 rounded-lg bg-input/40 p-0.5 sm:inline-flex"
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
        {backlog ? <BacklogSegment segment="backlog" behavior={backlog} /> : null}
        {planning ? <BacklogSegment segment="planning" behavior={planning} /> : null}
      </div>
    </>
  );
}
