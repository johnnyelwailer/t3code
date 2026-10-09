import type { JiraField, JiraIssue } from "./client.ts";

export type JiraEstimateField = {
  readonly id: string;
  readonly label: string;
};

export type JiraSprintField = {
  readonly id: string;
  readonly label: string;
};

export type JiraIssueSprint = {
  readonly id: string;
  readonly name: string;
  readonly state?: string;
  readonly boardId?: string;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly completeDate?: string;
};

export type JiraIssueTimeTracking = {
  readonly originalEstimateSeconds?: number;
  readonly remainingEstimateSeconds?: number;
  readonly aggregateOriginalEstimateSeconds?: number;
  readonly aggregateRemainingEstimateSeconds?: number;
};

const EXACT_ESTIMATE_LABELS = new Set(["story point estimate", "story points"]);
const PARTIAL_ESTIMATE_LABELS = ["story point", "estimate"];
const JIRA_SPRINT_CUSTOM_FIELD = "com.pyxis.greenhopper.jira:gh-sprint";

function isNumericField(field: JiraField): boolean {
  return field.schema?.type?.toLowerCase() === "number";
}

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeSprint(value: unknown): JiraIssueSprint | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const sprint = value as Record<string, unknown>;
  const id = normalizeOptionalId(sprint.id);
  const name =
    typeof sprint.name === "string" && sprint.name.trim().length > 0 ? sprint.name : undefined;
  if (!id || !name) {
    return undefined;
  }

  const boardId = normalizeOptionalId(sprint.boardId) ?? normalizeOptionalId(sprint.originBoardId);
  const state =
    typeof sprint.state === "string" && sprint.state.trim().length > 0 ? sprint.state : undefined;
  const goal =
    typeof sprint.goal === "string" && sprint.goal.trim().length > 0 ? sprint.goal : undefined;
  const startDate =
    typeof sprint.startDate === "string" && sprint.startDate.trim().length > 0
      ? sprint.startDate
      : undefined;
  const endDate =
    typeof sprint.endDate === "string" && sprint.endDate.trim().length > 0
      ? sprint.endDate
      : undefined;
  const completeDate =
    typeof sprint.completeDate === "string" && sprint.completeDate.trim().length > 0
      ? sprint.completeDate
      : undefined;

  return {
    id,
    name,
    ...(state ? { state } : {}),
    ...(boardId ? { boardId } : {}),
    ...(goal ? { goal } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(completeDate ? { completeDate } : {}),
  };
}

function compareSprintStates(left: string | undefined, right: string | undefined): number {
  const rank = (value: string | undefined): number => {
    switch (value?.toLowerCase()) {
      case "active":
        return 0;
      case "future":
        return 1;
      case "closed":
        return 2;
      default:
        return 3;
    }
  };

  return rank(left) - rank(right);
}

function compareSprintDates(left: JiraIssueSprint, right: JiraIssueSprint): number {
  const parseDate = (value: string | undefined): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };

  return (
    parseDate(right.startDate) - parseDate(left.startDate) ||
    parseDate(right.endDate) - parseDate(left.endDate) ||
    parseDate(right.completeDate) - parseDate(left.completeDate)
  );
}

export function findJiraEstimateField(fields: ReadonlyArray<JiraField>): JiraEstimateField | null {
  const numericFields = fields.filter(isNumericField);
  const exactMatch = numericFields.find((field) =>
    EXACT_ESTIMATE_LABELS.has(field.name.trim().toLowerCase()),
  );

  if (exactMatch) {
    return { id: exactMatch.id, label: exactMatch.name };
  }

  const partialMatch = numericFields.find((field) => {
    const normalizedName = field.name.trim().toLowerCase();
    return PARTIAL_ESTIMATE_LABELS.some((candidate) => normalizedName.includes(candidate));
  });

  return partialMatch ? { id: partialMatch.id, label: partialMatch.name } : null;
}

export function findJiraSprintField(fields: ReadonlyArray<JiraField>): JiraSprintField | null {
  const match = fields.find((field) => field.schema?.custom === JIRA_SPRINT_CUSTOM_FIELD);
  return match ? { id: match.id, label: match.name } : null;
}

export function readJiraEstimateValue(
  issue: JiraIssue,
  estimateField: JiraEstimateField | null,
): number | undefined {
  if (!estimateField) return undefined;
  const value = issue.fields[estimateField.id];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readJiraAssigneeAccountId(issue: JiraIssue): string | undefined {
  const assignee = issue.fields.assignee;
  if (!assignee || typeof assignee !== "object") return undefined;
  const accountId = (assignee as { accountId?: unknown }).accountId;
  return typeof accountId === "string" && accountId.trim().length > 0 ? accountId : undefined;
}

/**
 * `normalizeIssueSearch` leaves out the assignee's accountId; My Work needs it to tell the
 * viewer's own issues from parent context. Items line up 1:1 with `issues`.
 */
export function withJiraAssigneeAccountIds<T extends object>(
  issues: ReadonlyArray<JiraIssue>,
  items: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return items.map((item, index) => {
    const issue = issues[index];
    const assigneeAccountId = issue ? readJiraAssigneeAccountId(issue) : undefined;
    return assigneeAccountId ? Object.assign({}, item, { assigneeAccountId }) : item;
  });
}

export function readJiraSubtaskCount(issue: JiraIssue): number | undefined {
  const subtasks = issue.fields.subtasks;
  return Array.isArray(subtasks) ? subtasks.length : undefined;
}

export function readJiraTimeTracking(issue: JiraIssue): JiraIssueTimeTracking {
  const originalEstimateSeconds = readOptionalSeconds(issue.fields.timeoriginalestimate);
  const remainingEstimateSeconds = readOptionalSeconds(issue.fields.timeestimate);
  const aggregateOriginalEstimateSeconds = readOptionalSeconds(
    issue.fields.aggregatetimeoriginalestimate,
  );
  const aggregateRemainingEstimateSeconds = readOptionalSeconds(issue.fields.aggregatetimeestimate);

  return {
    ...(originalEstimateSeconds !== undefined ? { originalEstimateSeconds } : {}),
    ...(remainingEstimateSeconds !== undefined ? { remainingEstimateSeconds } : {}),
    ...(aggregateOriginalEstimateSeconds !== undefined ? { aggregateOriginalEstimateSeconds } : {}),
    ...(aggregateRemainingEstimateSeconds !== undefined
      ? { aggregateRemainingEstimateSeconds }
      : {}),
  };
}

export function readJiraSprints(
  issue: JiraIssue,
  sprintField: JiraSprintField | null,
): ReadonlyArray<JiraIssueSprint> {
  if (!sprintField) {
    return [];
  }

  const sprintValue = issue.fields[sprintField.id];
  const sprintEntries = Array.isArray(sprintValue) ? sprintValue : sprintValue ? [sprintValue] : [];

  return sprintEntries
    .map((entry) => normalizeSprint(entry))
    .filter((entry): entry is JiraIssueSprint => entry !== undefined);
}

export function selectJiraPrimarySprint(
  sprints: ReadonlyArray<JiraIssueSprint>,
  options: {
    sprintId?: string;
  } = {},
): JiraIssueSprint | undefined {
  if (options.sprintId) {
    const exactMatch = sprints.find((sprint) => sprint.id === options.sprintId);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return sprints.toSorted((left, right) => {
    const byState = compareSprintStates(left.state, right.state);
    if (byState !== 0) return byState;

    const byDate = compareSprintDates(left, right);
    if (byDate !== 0) return byDate;

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  })[0];
}
