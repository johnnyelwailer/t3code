import type { DigestDependency, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

const LEAD: Record<DigestDependency["relation"], string> = {
  "waits-on-you": "waits on this",
  "you-wait-on": "you wait on",
  "same-story": "same story",
};

/** One person, their ticket behind a tooltip: who, and on what. */
function DependencyPerson({ dependency }: { dependency: DigestDependency }) {
  const { other } = dependency;
  const name = other.assignee ?? "Unassigned";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={other.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
          >
            <WorkItemPersonAvatar person={{ displayName: name }} size="sm" />
            <span>{name.split(" ")[0]}</span>
          </a>
        }
      />
      <TooltipPopup side="top" className="max-w-sm">
        <p className="font-medium">
          {other.key} · {other.title}
        </p>
        <p className="text-muted-foreground">
          {name} · {other.status}
        </p>
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * The people a ticket hangs together with, one line: who waits on it, whom it waits on, who else
 * is on the story. Finished work drops out — it no longer holds anyone up.
 */
export function DigestDependencyLine({
  graph,
  ticketId,
}: {
  graph: DigestGraph;
  ticketId: string;
}) {
  const live = (graph.dependencies ?? []).filter(
    (dependency) =>
      dependency.ticketId === ticketId &&
      getProjectTicketKanbanLane(dependency.other.status) !== "done",
  );
  if (live.length === 0) return null;
  // One chip per person per relation, and never the viewer: "same story: Philip" says nothing.
  const relations = (["waits-on-you", "you-wait-on", "same-story"] as const).flatMap((relation) => {
    const byPerson = new Map<string, DigestDependency>();
    for (const dependency of live) {
      const person = dependency.other.assignee ?? "";
      const isViewer = person.trim().toLowerCase() === graph.viewer.name.trim().toLowerCase();
      if (dependency.relation !== relation || isViewer) continue;
      if (!byPerson.has(person)) byPerson.set(person, dependency);
    }
    const people = [...byPerson.values()];
    return people.length > 0 ? [{ relation, people }] : [];
  });
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {relations.map(({ relation, people }) => (
        <span
          key={relation}
          className={`inline-flex flex-wrap items-center gap-1.5 ${relation === "waits-on-you" ? "text-warning" : ""}`}
        >
          {LEAD[relation]}
          {people.slice(0, 4).map((dependency) => (
            <DependencyPerson key={`${relation}-${dependency.other.key}`} dependency={dependency} />
          ))}
          {people.length > 4 ? <span>+{people.length - 4}</span> : null}
        </span>
      ))}
    </p>
  );
}
