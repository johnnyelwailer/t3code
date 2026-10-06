import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";

const MODES: ReadonlyArray<{ value: ProjectDashboardMode; label: string }> = [
  { value: "my-work", label: "My work" },
  { value: "backlog", label: "Backlog" },
];

/**
 * The project dashboard's "My work | Backlog" switch. It is controlled: the dashboard passes the
 * persisted mode state and its one setter, which writes both the session state and `?projectView=`.
 */
export function ProjectDashboardModeTabs({
  mode,
  onModeChange,
}: {
  mode: ProjectDashboardMode;
  onModeChange: (mode: ProjectDashboardMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Project view"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-input/40 p-0.5"
    >
      {MODES.map(({ value, label }) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-mode={value}
            onClick={() => {
              if (!selected) onModeChange(value);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
