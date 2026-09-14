import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

export function ProjectMyWorkDigestHeader({ graph, nowMs }: { graph: DigestGraph; nowMs: number }) {
  const sprint = graph.sprint;
  const scopeLabel = graph.scope === "all" ? `All projects · ${graph.projects.length}` : graph.projects[0]?.name;
  if (!sprint) {
    return (
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 border-b border-border/70 pb-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">My Work</h1>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-1 text-[12.5px] text-muted-foreground">
          {graph.scope === "all"
            ? graph.projects.map((project) => (
                <span key={project.id}>
                  <b className="font-semibold text-foreground">{graph.tickets.filter((t) => t.projectId === project.id).length}</b> {project.name}
                </span>
              ))
            : null}
          <span>{graph.viewer.name} · {graph.viewer.role}</span>
        </div>
      </header>
    );
  }
  const start = Date.parse(sprint.startDate);
  const end = Date.parse(sprint.endDate);
  const total = Math.max(1, Math.round((end - start) / DAY_MS));
  const day = Math.min(total, Math.max(1, Math.ceil((nowMs - start) / DAY_MS)));
  const pct = Math.round(((nowMs - start) / (end - start)) * 100);
  return (
    <header className="space-y-4 border-b border-border/70 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {sprint.name} <span className="font-normal text-muted-foreground">· Day {day} of {total}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>{formatDay(sprint.startDate)} – {formatDay(sprint.endDate)}</span>
          <span><b className="font-semibold text-foreground">{total - day}</b> days left</span>
          <span>{graph.viewer.name} · {graph.viewer.role}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="relative h-1 rounded-full bg-border">
          <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
          <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-muted-foreground/80">
          <span>{formatDay(sprint.startDate)}</span>
          <span>{pct} % elapsed</span>
          <span>{formatDay(sprint.endDate)}</span>
        </div>
      </div>
      {sprint.goal.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted-foreground">
          {sprint.goal.map((line) => (
            <li key={line} className="before:mr-1.5 before:text-muted-foreground/50 before:content-['–']">{line}</li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
