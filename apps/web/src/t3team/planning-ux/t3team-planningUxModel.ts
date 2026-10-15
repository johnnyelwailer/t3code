/**
 * Planning UX exploration (draft, not wired into the app): role lenses, readiness checks and
 * team load over a backlog snapshot. Pure helpers over `ProjectTicket`s so the prototypes in
 * `stories/t3team-PlanningUx.stories.tsx` can be moved into the planning space later.
 */
import type { ProjectTicket } from "~/t3team/t3team-types";

export type LensId = "team-load" | "my-stories" | "refinement" | "test-queue" | "epics";

export const LENSES: ReadonlyArray<{ readonly id: LensId; readonly label: string }> = [
  { id: "team-load", label: "Team load" },
  { id: "my-stories", label: "My stories" },
  { id: "refinement", label: "Refinement" },
  { id: "test-queue", label: "Test queue" },
  { id: "epics", label: "Epics" },
];

/** Profiles mirror the pack's work profiles; a profile only picks the DEFAULT lens. */
export type ProfileId = "delivery-lead" | "engineer" | "product" | "quality";

export const PROFILES: ReadonlyArray<{
  readonly id: ProfileId;
  readonly label: string;
  readonly defaultLens: LensId;
  readonly suggestions: ReadonlyArray<string>;
}> = [
  {
    id: "delivery-lead",
    label: "Delivery Lead",
    defaultLens: "team-load",
    suggestions: [
      "Balance next sprint to capacity",
      "What should go out of the sprint?",
      "Summarize carry-over",
    ],
  },
  {
    id: "engineer",
    label: "Engineer",
    defaultLens: "my-stories",
    suggestions: [
      "Which of my stories aren't ready?",
      "My stories, ordered by what to do first",
      "Draft subtasks for my top story",
    ],
  },
  {
    id: "product",
    label: "Requirements & Product",
    defaultLens: "refinement",
    suggestions: [
      "Stories without acceptance criteria",
      "Suggest splits for stories over 16h",
      "Order next sprint by sprint goal",
    ],
  },
  {
    id: "quality",
    label: "Quality & Testing",
    defaultLens: "test-queue",
    suggestions: [
      "Stale items in test",
      "Test plan for sprint-goal stories",
      "Possible duplicate bugs",
    ],
  },
];

const DONE = /^(done|accepted|rejected|time logging|closed|resolved)$/i;
export const isDone = (t: ProjectTicket) => DONE.test(t.status);
export const isStory = (t: ProjectTicket) => !t.issueTypeIsSubtask && t.issueType !== "Epic";

export interface Readiness {
  readonly subtasks: number;
  readonly estimateSeconds: number;
  readonly reviewer: string | null;
  readonly acceptanceCriteria: boolean;
  readonly owner: string | null;
}

export function childrenOf(tickets: readonly ProjectTicket[], id: string): ProjectTicket[] {
  return tickets.filter((t) => t.parentId === id);
}

export function readinessOf(tickets: readonly ProjectTicket[], story: ProjectTicket): Readiness {
  const subs = childrenOf(tickets, story.id).filter((t) => t.issueTypeIsSubtask);
  const subEstimate = subs.reduce((sum, t) => sum + (t.timeOriginalEstimateSeconds ?? 0), 0);
  const review = subs.find((t) => /review/i.test(t.ref.title) && t.assignee);
  return {
    subtasks: subs.length,
    estimateSeconds:
      story.aggregateTimeOriginalEstimateSeconds ??
      story.timeOriginalEstimateSeconds ??
      subEstimate,
    reviewer: review?.assignee ?? null,
    acceptanceCriteria: Boolean(story.description),
    owner: story.assignee ?? null,
  };
}

export function readinessScore(r: Readiness): number {
  return [r.subtasks > 0, r.estimateSeconds > 0, r.reviewer !== null, r.acceptanceCriteria].filter(
    Boolean,
  ).length;
}

export const hours = (seconds: number) => Math.round(seconds / 3600);

/** Remaining work per person in a sprint: subtasks, plus stories that carry their own hours. */
export function loadByPerson(
  tickets: readonly ProjectTicket[],
  sprintId: string,
): Map<string, { seconds: number; items: number }> {
  const out = new Map<string, { seconds: number; items: number }>();
  for (const t of tickets) {
    if (t.sprintId !== sprintId || isDone(t) || t.issueType === "Epic") continue;
    if (!t.issueTypeIsSubtask && (t.subtaskCount ?? 0) > 0) continue;
    const who = t.assignee ?? "Unassigned";
    const cur = out.get(who) ?? { seconds: 0, items: 0 };
    cur.seconds += t.timeRemainingEstimateSeconds ?? t.timeOriginalEstimateSeconds ?? 0;
    cur.items += 1;
    out.set(who, cur);
  }
  return out;
}

export function sprintMeta(tickets: readonly ProjectTicket[], sprintId: string) {
  const t = tickets.find((x) => x.sprintId === sprintId);
  return {
    id: sprintId,
    name: t?.sprintName ?? sprintId,
    goal: t?.sprintGoal ?? "",
    end: t?.sprintEndDate ?? null,
    state: t?.sprintState ?? null,
  };
}

export function epicOf(tickets: readonly ProjectTicket[], t: ProjectTicket): ProjectTicket | null {
  let cur: ProjectTicket | undefined = t;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur.issueType === "Epic") return cur;
    cur = cur.parentId ? tickets.find((x) => x.id === cur!.parentId) : undefined;
  }
  return null;
}
