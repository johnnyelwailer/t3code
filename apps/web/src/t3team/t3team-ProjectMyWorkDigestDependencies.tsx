import type { DigestDependency, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

// Said from the ticket's side, the way Jira links read: this ticket blocks theirs (they wait on
// you), or theirs blocks this one (you wait on them).
const LEAD: Record<DigestDependency["relation"], string> = {
  "waits-on-you": "blocks",
  "you-wait-on": "blocked by",
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
            <WorkItemPersonAvatar
              person={{
                displayName: name,
                ...(other.assigneeAvatarUrl ? { avatarUrl: other.assigneeAvatarUrl } : {}),
              }}
              size="sm"
            />
            <span>{name.split(" ")[0]}</span>
            {dependency.relation !== "same-story" ? (
              // Their ticket says what part they own (FE, BE, review…) and is what links the two.
              <span className="min-w-0 max-w-48 truncate text-muted-foreground">
                <span className="font-mono">{other.key}</span> {other.title}
              </span>
            ) : null}
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
 * The people a ticket hangs together with, one line: who waits on it and whom it waits on.
 * Finished work drops out — it no longer holds anyone up.
 */
export function DigestDependencyLine({
  graph,
  ticketId,
}: {
  graph: DigestGraph;
  ticketId: string;
}) {
  // Blocking links only. "Same story" named a person without saying on what, which read as noise;
  // story cards show their siblings as pills (key, status, owner) instead.
  const live = (graph.dependencies ?? []).filter(
    (dependency) =>
      dependency.ticketId === ticketId &&
      dependency.relation !== "same-story" &&
      getProjectTicketKanbanLane(dependency.other.status) !== "done",
  );
  if (live.length === 0) return null;
  // One chip per person per relation, and never the viewer.
  const relations = (["waits-on-you", "you-wait-on"] as const).flatMap((relation) => {
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
