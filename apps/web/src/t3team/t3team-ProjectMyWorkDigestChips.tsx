import type { ReactNode } from "react";

import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export function formatDigestAgo(nowMs: number, iso: string): string {
  const minutes = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function DigestStatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 text-[11px] leading-none text-muted-foreground">
      {status}
    </span>
  );
}

export function DigestKicker({
  children,
  count,
  right,
}: {
  children: ReactNode;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <span>{children}</span>
      {count !== undefined ? (
        <span className="font-normal tabular-nums text-muted-foreground/70">{count}</span>
      ) : null}
      {right ? (
        <span className="ml-auto font-normal normal-case tracking-normal">{right}</span>
      ) : null}
    </div>
  );
}

export function DigestProjectChip({ graph, projectId }: { graph: DigestGraph; projectId: string }) {
  if (graph.scope !== "all") return null;
  const project = graph.projects.find((entry) => entry.id === projectId);
  const name = project?.name ?? projectId;
  const chip = (
    <span className="block min-w-0 max-w-[9rem] shrink truncate rounded bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground">
      {name}
    </span>
  );
  return project?.url ? (
    <a href={project.url} className="min-w-0 shrink hover:opacity-80">
      {chip}
    </a>
  ) : (
    chip
  );
}
