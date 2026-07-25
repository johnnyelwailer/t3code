/**
 * Visual vocabulary for Jira work item fields.
 *
 * Jira ships its own colour names (status category `colorName`, priority names). Mapping them
 * onto our semantic design tokens in one place keeps the detail view, the rail and the activity
 * stream in agreement, and keeps light/dark correctness out of individual components.
 */

export type WorkItemStatusTone = "todo" | "inProgress" | "done";

export type WorkItemPriorityTone = "highest" | "high" | "medium" | "low" | "lowest";

/**
 * Jira status categories are stable across sites: `new` (To Do), `indeterminate` (In Progress),
 * `done` (Done). `undefined` is Jira's literal key for uncategorised statuses.
 */
export function resolveWorkItemStatusTone(input: {
  readonly statusCategoryKey?: string | undefined;
  readonly statusName?: string | undefined;
}): WorkItemStatusTone {
  const categoryKey = input.statusCategoryKey?.trim().toLowerCase();
  if (categoryKey === "done") return "done";
  if (categoryKey === "indeterminate") return "inProgress";
  if (categoryKey === "new") return "todo";

  // Sites with a misconfigured category still read sensibly from the status name.
  const statusName = input.statusName?.trim().toLowerCase() ?? "";
  if (/\b(done|closed|resolved|complete|completed|shipped|released)\b/.test(statusName)) {
    return "done";
  }
  if (/\b(progress|review|testing|qa|doing|started|development)\b/.test(statusName)) {
    return "inProgress";
  }
  return "todo";
}

const STATUS_BADGE_VARIANTS = {
  todo: "secondary",
  inProgress: "info",
  done: "success",
} as const satisfies Record<WorkItemStatusTone, string>;

export function workItemStatusBadgeVariant(
  tone: WorkItemStatusTone,
): (typeof STATUS_BADGE_VARIANTS)[WorkItemStatusTone] {
  return STATUS_BADGE_VARIANTS[tone];
}

/** Dot colour for compact status affordances where a full badge would be too heavy. */
export const workItemStatusDotClassName: Record<WorkItemStatusTone, string> = {
  todo: "bg-muted-foreground/50",
  inProgress: "bg-info",
  done: "bg-success",
};

const PRIORITY_ALIASES: Record<WorkItemPriorityTone, ReadonlyArray<string>> = {
  highest: ["highest", "blocker", "critical", "p0"],
  high: ["high", "major", "p1"],
  medium: ["medium", "normal", "moderate", "p2"],
  low: ["low", "minor", "p3"],
  lowest: ["lowest", "trivial", "p4"],
};

export function resolveWorkItemPriorityTone(
  priority: string | undefined,
): WorkItemPriorityTone | undefined {
  const normalized = priority?.trim().toLowerCase();
  if (!normalized) return undefined;

  for (const [tone, aliases] of Object.entries(PRIORITY_ALIASES) as Array<
    [WorkItemPriorityTone, ReadonlyArray<string>]
  >) {
    if (aliases.includes(normalized)) return tone;
  }
  return undefined;
}

/**
 * Priority reads as direction plus urgency: upward chevrons for above-normal, downward for below.
 * Colour carries urgency, orientation carries direction, so it survives colour-blind viewing.
 */
export const workItemPriorityClassName: Record<WorkItemPriorityTone, string> = {
  highest: "text-destructive",
  high: "text-destructive/80",
  medium: "text-warning",
  low: "text-info/80",
  lowest: "text-muted-foreground",
};

/** Above-normal priorities point up, below-normal point down; medium uses its own flat glyph. */
export function workItemPriorityPointsDown(tone: WorkItemPriorityTone): boolean {
  return tone === "low" || tone === "lowest";
}

/** The extremes double the chevron, so rank is readable without comparing colours. */
export function workItemPriorityIsDoubled(tone: WorkItemPriorityTone): boolean {
  return tone === "highest" || tone === "lowest";
}
