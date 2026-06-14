import type {
  CommitMutationInput,
  IntegrationAccount,
  IntegrationAccountRef,
  IntegrationAction,
  IntegrationProvider,
  IntegrationSearchInput,
  ListResourcesInput,
  MutationResult,
  PrepareMutationInput,
  PreparedMutation,
  ResourceSearchResult,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";
import type { ExternalProject } from "@t3tools/integrations-core";
import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  type JiraIssue,
} from "./client.ts";
import { JiraApiClient, type JiraApiAuth } from "./jiraApi.ts";
import {
  normalizeAccount,
  normalizeIssue,
  normalizeIssueSearch,
  normalizeProject,
} from "./normalize.ts";
import {
  formatJiraIssueTransitionNames,
  selectJiraIssueTransitionForStatus,
} from "./statusTransitions.ts";
import {
  findJiraEstimateField,
  readJiraAssigneeAccountId,
  readJiraEstimateValue,
  readJiraSprints,
  readJiraSubtaskCount,
  readJiraTimeTracking,
  selectJiraPrimarySprint,
  type JiraEstimateField,
  type JiraSprintField,
  findJiraSprintField,
} from "./planning.ts";

export type AtlassianBacklogBoard = {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
};

export type AtlassianBacklogBoardColumnStatus = {
  readonly id?: string;
  readonly name: string;
};

export type AtlassianBacklogBoardColumn = {
  readonly name: string;
  readonly statuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>;
};

export type AtlassianBacklogSprint = {
  readonly id: string;
  readonly name: string;
  readonly state?: string;
  readonly boardId?: string;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly completeDate?: string;
};

export type AtlassianBacklogSavedFilter = {
  readonly id: string;
  readonly name: string;
  readonly jql: string;
  readonly ownerDisplayName?: string;
  readonly favourite?: boolean;
};

export type AtlassianBacklogSelection = {
  readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
  readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  readonly selectedBoardId?: string;
  readonly selectedBoardColumns?: ReadonlyArray<AtlassianBacklogBoardColumn>;
  readonly selectedSprintId?: string;
  readonly selectedFilterId?: string;
  readonly selectedFilterJql?: string;
};

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function backlogSprintStateRank(value: string | undefined): number {
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
}

function parseBacklogDate(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareBacklogBoards(left: AtlassianBacklogBoard, right: AtlassianBacklogBoard): number {
  if ((left.type ?? "").toLowerCase() === "scrum" && (right.type ?? "").toLowerCase() !== "scrum") {
    return -1;
  }
  if ((right.type ?? "").toLowerCase() === "scrum" && (left.type ?? "").toLowerCase() !== "scrum") {
    return 1;
  }
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareBacklogSprints(
  left: AtlassianBacklogSprint,
  right: AtlassianBacklogSprint,
): number {
  return (
    backlogSprintStateRank(left.state) - backlogSprintStateRank(right.state) ||
    parseBacklogDate(right.startDate) - parseBacklogDate(left.startDate) ||
    parseBacklogDate(right.endDate) - parseBacklogDate(left.endDate) ||
    parseBacklogDate(right.completeDate) - parseBacklogDate(left.completeDate) ||
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function compareBacklogSavedFilters(
  left: AtlassianBacklogSavedFilter,
  right: AtlassianBacklogSavedFilter,
): number {
  if (left.favourite && !right.favourite) {
    return -1;
  }
  if (right.favourite && !left.favourite) {
    return 1;
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

const jiraIssueSearchPageSize = 100;
const defaultBacklogResourceLimit = 100;

function toBacklogBoard(board: {
  id: string | number;
  name: string;
  type?: string;
}): AtlassianBacklogBoard | undefined {
  const id = normalizeOptionalId(board.id);
  if (!id || board.name.trim().length === 0) {
    return undefined;
  }

  return {
    id,
    name: board.name,
    ...(board.type ? { type: board.type } : {}),
  };
}

function toBacklogBoardColumnStatus(status: {
  id?: string | number;
  name?: string;
}): AtlassianBacklogBoardColumnStatus | undefined {
  const name = typeof status.name === "string" ? status.name.trim() : "";
  if (name.length === 0) {
    return undefined;
  }

  const id = normalizeOptionalId(status.id);
  return {
    name,
    ...(id ? { id } : {}),
  };
}

function toBacklogBoardColumn(column: {
  name?: string;
  statuses?: ReadonlyArray<{ id?: string | number; name?: string }>;
}): AtlassianBacklogBoardColumn | undefined {
  const name = typeof column.name === "string" ? column.name.trim() : "";
  const statuses = (column.statuses ?? [])
    .map((status) => toBacklogBoardColumnStatus(status))
    .filter((status): status is AtlassianBacklogBoardColumnStatus => status !== undefined);

  if (name.length === 0 || statuses.length === 0) {
    return undefined;
  }

  return {
    name,
    statuses,
  };
}

function toBacklogSprint(sprint: {
  id: string | number;
  name: string;
  state?: string;
  boardId?: string | number;
  originBoardId?: string | number;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}): AtlassianBacklogSprint | undefined {
  const id = normalizeOptionalId(sprint.id);
  if (!id || sprint.name.trim().length === 0) {
    return undefined;
  }

  const boardId = normalizeOptionalId(sprint.boardId) ?? normalizeOptionalId(sprint.originBoardId);
  return {
    id,
    name: sprint.name,
    ...(sprint.state ? { state: sprint.state } : {}),
    ...(boardId ? { boardId } : {}),
    ...(sprint.goal ? { goal: sprint.goal } : {}),
    ...(sprint.startDate ? { startDate: sprint.startDate } : {}),
    ...(sprint.endDate ? { endDate: sprint.endDate } : {}),
    ...(sprint.completeDate ? { completeDate: sprint.completeDate } : {}),
  };
}

function toBacklogSavedFilter(filter: {
  id: string | number;
  name: string;
  jql?: string;
  favourite?: boolean;
  owner?: { displayName?: string };
}): AtlassianBacklogSavedFilter | undefined {
  const id = normalizeOptionalId(filter.id);
  const jql = typeof filter.jql === "string" ? filter.jql.trim() : "";
  if (!id || filter.name.trim().length === 0 || jql.length === 0) {
    return undefined;
  }

  return {
    id,
    name: filter.name,
    jql,
    ...(filter.owner?.displayName ? { ownerDisplayName: filter.owner.displayName } : {}),
    ...(filter.favourite !== undefined ? { favourite: filter.favourite } : {}),
  };
}

function selectBacklogBoard(
  boards: ReadonlyArray<AtlassianBacklogBoard>,
  requestedBoardId: string | undefined,
  defaultBoardId?: string,
): AtlassianBacklogBoard | undefined {
  if (requestedBoardId) {
    const requestedBoard = boards.find((board) => board.id === requestedBoardId);
    if (requestedBoard) {
      return requestedBoard;
    }
  }

  if (defaultBoardId) {
    const defaultBoard = boards.find((board) => board.id === defaultBoardId);
    if (defaultBoard) {
      return defaultBoard;
    }
  }

  return boards[0];
}

function selectBacklogSprint(
  sprints: ReadonlyArray<AtlassianBacklogSprint>,
  requestedSprintId: string | undefined,
): AtlassianBacklogSprint | undefined {
  if (requestedSprintId) {
    const requestedSprint = sprints.find((sprint) => sprint.id === requestedSprintId);
    if (requestedSprint) {
      return requestedSprint;
    }
  }

  return sprints[0];
}

function selectBacklogSavedFilter(
  savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>,
  requestedFilterId: string | undefined,
): AtlassianBacklogSavedFilter | undefined {
  return requestedFilterId
    ? savedFilters.find((savedFilter) => savedFilter.id === requestedFilterId)
    : undefined;
}

function buildSprintJqlClause(sprintId: string): string {
  return /^\d+$/.test(sprintId)
    ? `Sprint = ${sprintId}`
    : `Sprint = "${sprintId.replace(/"/g, '\\"')}"`;
}

function stripJqlOrderBy(jql: string | undefined): string | undefined {
  const trimmed = jql?.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutOrderBy = trimmed.replace(/\border\s+by\b[\s\S]*$/i, "").trim();
  return withoutOrderBy.length > 0 ? withoutOrderBy : undefined;
}

function mergeBacklogBoards(
  preferredBoards: ReadonlyArray<AtlassianBacklogBoard>,
  fallbackBoards: ReadonlyArray<AtlassianBacklogBoard>,
): ReadonlyArray<AtlassianBacklogBoard> {
  const merged = new Map<string, AtlassianBacklogBoard>();
  const orderedIds: string[] = [];

  const register = (board: AtlassianBacklogBoard) => {
    const existing = merged.get(board.id);
    if (!existing) {
      orderedIds.push(board.id);
      merged.set(board.id, board);
      return;
    }

    const next: {
      id: string;
      name: string;
      type?: string;
    } = {
      id: board.id,
      name: board.name,
    };
    const nextType = existing.type ?? board.type;
    if (nextType !== undefined) {
      next.type = nextType;
    }
    merged.set(board.id, next);
  };

  for (const board of preferredBoards) {
    register(board);
  }

  for (const board of fallbackBoards) {
    register(board);
  }

  return orderedIds.map((boardId) => merged.get(boardId)!).filter(Boolean);
}

function mergeBacklogSprints(
  preferredSprints: ReadonlyArray<AtlassianBacklogSprint>,
  fallbackSprints: ReadonlyArray<AtlassianBacklogSprint>,
): ReadonlyArray<AtlassianBacklogSprint> {
  const merged = new Map<string, AtlassianBacklogSprint>();

  for (const sprint of fallbackSprints) {
    merged.set(sprint.id, sprint);
  }

  for (const sprint of preferredSprints) {
    const existing = merged.get(sprint.id);
    const next: {
      id: string;
      name: string;
      state?: string;
      boardId?: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
      completeDate?: string;
    } = {
      id: sprint.id,
      name: sprint.name,
    };
    const nextState = sprint.state ?? existing?.state;
    const nextBoardId = sprint.boardId ?? existing?.boardId;
    const nextGoal = sprint.goal ?? existing?.goal;
    const nextStartDate = sprint.startDate ?? existing?.startDate;
    const nextEndDate = sprint.endDate ?? existing?.endDate;
    const nextCompleteDate = sprint.completeDate ?? existing?.completeDate;

    if (nextState !== undefined) {
      next.state = nextState;
    }
    if (nextBoardId !== undefined) {
      next.boardId = nextBoardId;
    }
    if (nextGoal !== undefined) {
      next.goal = nextGoal;
    }
    if (nextStartDate !== undefined) {
      next.startDate = nextStartDate;
    }
    if (nextEndDate !== undefined) {
      next.endDate = nextEndDate;
    }
    if (nextCompleteDate !== undefined) {
      next.completeDate = nextCompleteDate;
    }

    merged.set(sprint.id, next);
  }

  return [...merged.values()].toSorted(compareBacklogSprints);
}

function filterBacklogSprintsByBoard(
  sprints: ReadonlyArray<AtlassianBacklogSprint>,
  boardId: string,
): ReadonlyArray<AtlassianBacklogSprint> {
  return sprints.filter((sprint) => sprint.boardId === boardId);
}

function findSprintBoardId(
  sprints: ReadonlyArray<AtlassianBacklogSprint>,
  sprintId: string | undefined,
): string | undefined {
  if (!sprintId) {
    return undefined;
  }

  return sprints.find((sprint) => sprint.id === sprintId)?.boardId;
}

function selectPreferredParticipantSprint(
  candidates: ReadonlyArray<{
    sprint: AtlassianBacklogSprint;
    issueCount: number;
  }>,
): AtlassianBacklogSprint | undefined {
  return candidates.toSorted((left, right) => {
    if (right.issueCount !== left.issueCount) {
      return right.issueCount - left.issueCount;
    }

    return compareBacklogSprints(left.sprint, right.sprint);
  })[0]?.sprint;
}

function readJiraIssueIdentity(issue: unknown): string | undefined {
  if (!issue || typeof issue !== "object") {
    return undefined;
  }

  const jiraIssue = issue as { id?: unknown; key?: unknown };
  if (typeof jiraIssue.id === "string" && jiraIssue.id.trim().length > 0) {
    return jiraIssue.id;
  }
  if (typeof jiraIssue.key === "string" && jiraIssue.key.trim().length > 0) {
    return jiraIssue.key;
  }
  return undefined;
}

function issueTypeUsesHourEstimates(input: {
  issueType?: string;
  issueTypeIsSubtask?: boolean;
}): boolean {
  if (input.issueTypeIsSubtask === true) {
    return true;
  }

  const normalized = input.issueType?.trim().toLowerCase() ?? "";
  return normalized.includes("subtask") || normalized.includes("sub-task");
}

function secondsToRoundedHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

function formatHoursForJira(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const absoluteMinutes = Math.max(0, totalMinutes);
  const wholeHours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;

  if (wholeHours > 0 && remainingMinutes > 0) {
    return `${wholeHours}h ${remainingMinutes}m`;
  }
  if (wholeHours > 0) {
    return `${wholeHours}h`;
  }
  return `${remainingMinutes}m`;
}

function buildPlainTextAdfDocument(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph) => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      })),
  };
}

function hasCreateMetaField(
  issueType: { fields?: Record<string, unknown> },
  fieldId: string,
): boolean {
  return Boolean(issueType.fields && fieldId in issueType.fields);
}

function collectIssueBacklogSprints(
  issues: ReadonlyArray<unknown>,
  sprintField: JiraSprintField,
): ReadonlyArray<AtlassianBacklogSprint> {
  const sprints = new Map<string, AtlassianBacklogSprint>();

  for (const issue of issues) {
    const jiraIssue = issue as JiraIssue;
    for (const sprint of readJiraSprints(jiraIssue, sprintField)) {
      const normalizedSprint = toBacklogSprint(sprint);
      if (!normalizedSprint) {
        continue;
      }

      const existing = sprints.get(normalizedSprint.id);
      sprints.set(
        normalizedSprint.id,
        existing
          ? (mergeBacklogSprints([normalizedSprint], [existing])[0] ?? normalizedSprint)
          : normalizedSprint,
      );
    }
  }

  return [...sprints.values()].toSorted(compareBacklogSprints);
}

export type AtlassianIntegrationProviderConfig = {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
};

function normalizeSiteUrl(siteUrl: string): string {
  const trimmed = siteUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.endsWith("/") ? withProtocol.slice(0, -1) : withProtocol;
}

function describeAccountError(
  siteUrl: string,
  authKind: JiraApiAuth["kind"],
  cause: unknown,
): string {
  if (cause instanceof AtlassianAuthError) {
    return `${siteUrl}: ${cause.message}`;
  }

  if (cause instanceof AtlassianApiError) {
    return `${siteUrl}: Atlassian API request failed (${cause.status})`;
  }

  if (cause instanceof AtlassianNetworkError) {
    const reason = cause.cause instanceof Error ? ` (${cause.cause.message})` : "";
    if (authKind === "basic") {
      return `${siteUrl}: Jira did not return an HTTP response${reason}. Check that the site URL is correct, the local backend can reach Atlassian, and the API token has Jira access.`;
    }
    return `${siteUrl}: Jira did not return an HTTP response${reason}. Check network connectivity, browser blocking, or CORS for this Atlassian site.`;
  }

  if (cause instanceof Error) {
    return `${siteUrl}: ${cause.message}`;
  }

  return `${siteUrl}: ${String(cause)}`;
}

export class AtlassianIntegrationProvider implements IntegrationProvider {
  id = "atlassian";
  kind = "atlassian";
  private clients: Map<string, { client: JiraApiClient; siteUrl: string }> = new Map();

  constructor(auth: JiraApiAuth | AtlassianIntegrationProviderConfig) {
    if ("kind" in auth) {
      const key = auth.kind === "oauth" ? auth.cloudId : normalizeSiteUrl(auth.siteUrl);
      const clientAuth: JiraApiAuth =
        auth.kind === "basic" ? { ...auth, siteUrl: normalizeSiteUrl(auth.siteUrl) } : auth;
      this.clients.set(key, {
        client: new JiraApiClient(clientAuth),
        siteUrl:
          auth.kind === "oauth"
            ? `https://api.atlassian.com/ex/jira/${auth.cloudId}`
            : normalizeSiteUrl(auth.siteUrl),
      });
    } else {
      const siteUrl = normalizeSiteUrl(auth.siteUrl);
      this.clients.set(siteUrl, {
        client: new JiraApiClient({ ...auth, kind: "basic", siteUrl }),
        siteUrl,
      });
    }
  }

  static fromMultipleAuths(auths: ReadonlyArray<JiraApiAuth>): AtlassianIntegrationProvider {
    const provider = Object.create(
      AtlassianIntegrationProvider.prototype,
    ) as AtlassianIntegrationProvider;
    provider.id = "atlassian";
    provider.kind = "atlassian";
    provider.clients = new Map();
    for (const auth of auths) {
      const key = auth.kind === "oauth" ? auth.cloudId : normalizeSiteUrl(auth.siteUrl);
      const clientAuth: JiraApiAuth =
        auth.kind === "basic" ? { ...auth, siteUrl: normalizeSiteUrl(auth.siteUrl) } : auth;
      provider.clients.set(key, {
        client: new JiraApiClient(clientAuth),
        siteUrl:
          auth.kind === "oauth"
            ? `https://api.atlassian.com/ex/jira/${auth.cloudId}`
            : normalizeSiteUrl(auth.siteUrl),
      });
    }
    return provider;
  }

  private getClientForAccount(
    accountId: string,
  ): { client: JiraApiClient; siteUrl: string } | undefined {
    return this.clients.get(accountId);
  }

  private getDefaultClient(): { client: JiraApiClient; siteUrl: string } | undefined {
    const first = this.clients.values().next().value;
    return first;
  }

  async listAccounts(): Promise<ReadonlyArray<IntegrationAccount>> {
    const accounts: IntegrationAccount[] = [];
    const failures: string[] = [];
    for (const [key, { client, siteUrl }] of this.clients) {
      try {
        const myself = await client.getMyself();
        accounts.push(normalizeAccount(siteUrl, myself, key));
      } catch (cause) {
        failures.push(describeAccountError(siteUrl, client.authKind, cause));
      }
    }
    if (accounts.length === 0 && failures.length > 0) {
      throw new Error(`Failed to connect to Atlassian. ${failures.join("; ")}`);
    }
    return accounts;
  }

  async listProjects(account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
    const entry = this.getClientForAccount(account.id) ?? this.getDefaultClient();
    if (!entry) return [];
    const response = await entry.client.searchProjects();
    const enrichedProjects = await Promise.all(
      response.values.map(async (project) => {
        if (project.avatarUrls && Object.keys(project.avatarUrls).length > 0) {
          return project;
        }
        try {
          return await entry.client.getProject(project.id);
        } catch {
          return project;
        }
      }),
    );

    return enrichedProjects.map((project) => normalizeProject(project, entry.siteUrl));
  }

  async listResources(input: ListResourcesInput): Promise<ResourcePage> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) return { items: [], totalCount: 0 };

    const project = await this.findProjectById(input.externalProjectId, entry.client);
    if (!project) {
      return { items: [], totalCount: 0 };
    }

    const projectKey = project.key.replace(/"/g, '\\"');
    const assignedJql = `project = "${projectKey}" AND assignee = currentUser() ORDER BY updated DESC`;
    const assignedResponse = await entry.client.searchIssues(assignedJql, input.limit ?? 50);
    const assignedItems = normalizeIssueSearch(assignedResponse, entry.siteUrl);

    const parentKeys = new Set<string>();
    for (const issue of assignedResponse.issues) {
      if (!issue || typeof issue !== "object") continue;
      const fields = (issue as { fields?: unknown }).fields;
      if (!fields || typeof fields !== "object") continue;
      const parent = (fields as { parent?: unknown }).parent;
      if (!parent || typeof parent !== "object") continue;
      const parentKey = (parent as { key?: unknown }).key;
      if (typeof parentKey === "string" && parentKey.trim().length > 0) {
        parentKeys.add(parentKey);
      }
    }

    const assignedDisplayIds = new Set(assignedItems.map((item) => item.displayId));
    const missingParentKeys = [...parentKeys].filter((key) => !assignedDisplayIds.has(key));

    let parentItems: ReadonlyArray<(typeof assignedItems)[number]> = [];
    if (missingParentKeys.length > 0) {
      const quotedParentKeys = missingParentKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`);
      const parentJql = `key in (${quotedParentKeys.join(", ")}) ORDER BY updated DESC`;
      const parentResponse = await entry.client.searchIssues(parentJql, missingParentKeys.length);
      parentItems = normalizeIssueSearch(parentResponse, entry.siteUrl);
    }

    const itemsById = new Map<string, (typeof assignedItems)[number]>();
    for (const item of assignedItems) {
      itemsById.set(item.id, item);
    }
    for (const item of parentItems) {
      itemsById.set(item.id, item);
    }
    const items = [...itemsById.values()];

    return {
      items,
      totalCount: items.length,
    };
  }

  async listBacklogResources(
    input: ListResourcesInput & {
      boardId?: string;
      sprintId?: string;
      filterJql?: string;
      cursor?: string;
    },
  ): Promise<ResourcePage> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) return { items: [], totalCount: 0 };

    const project = await this.findProjectById(input.externalProjectId, entry.client);
    if (!project) {
      return { items: [], totalCount: 0 };
    }

    const projectKey = project.key.replace(/"/g, '\\"');
    const backlogJqlParts = [`project = "${projectKey}"`, "statusCategory != Done"];
    const filterJql = stripJqlOrderBy(input.filterJql);
    if (filterJql) {
      backlogJqlParts.unshift(`(${filterJql})`);
    }
    const requestedSprintId = input.sprintId?.trim();
    if (requestedSprintId) {
      backlogJqlParts.push(buildSprintJqlClause(requestedSprintId));
    }
    const backlogJql = `${backlogJqlParts.join(" AND ")} ORDER BY updated DESC`;
    const [estimateField, sprintField] = await Promise.all([
      this.resolveEstimateField(entry.client),
      this.resolveSprintField(entry.client),
    ]);
    const search = await this.searchIssuesWithPagination(
      entry.client,
      backlogJql,
      [
        ...(estimateField ? [estimateField.id] : []),
        ...(sprintField ? [sprintField.id] : []),
        "timeoriginalestimate",
        "timeestimate",
        "aggregatetimeoriginalestimate",
        "aggregatetimeestimate",
      ],
      input.limit ?? defaultBacklogResourceLimit,
      input.cursor,
    );
    const items = search.issues.map((issue) =>
      this.toBacklogItem(
        issue as JiraIssue,
        entry.siteUrl,
        estimateField,
        sprintField,
        requestedSprintId,
      ),
    );

    // Planning views need the referenced parents (epics, story parents of
    // sprint subtasks) for titles and grouping; the backlog page itself often
    // excludes them (other status category, outside the sprint). Fetch the
    // missing ones in a single keyed search and append them.
    const parentKeys = new Set<string>();
    for (const issue of search.issues) {
      if (!issue || typeof issue !== "object") continue;
      const fields = (issue as { fields?: unknown }).fields;
      if (!fields || typeof fields !== "object") continue;
      const parent = (fields as { parent?: unknown }).parent;
      if (!parent || typeof parent !== "object") continue;
      const parentKey = (parent as { key?: unknown }).key;
      if (typeof parentKey === "string" && parentKey.trim().length > 0) {
        parentKeys.add(parentKey);
      }
    }
    const presentDisplayIds = new Set(items.map((item) => item.displayId));
    const missingParentKeys = [...parentKeys].filter((key) => !presentDisplayIds.has(key));
    let parentItems: ReadonlyArray<(typeof items)[number]> = [];
    if (missingParentKeys.length > 0) {
      const quotedParentKeys = missingParentKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`);
      const parentJql = `key in (${quotedParentKeys.join(", ")}) ORDER BY updated DESC`;
      const parentResponse = await entry.client.searchIssues(parentJql, missingParentKeys.length);
      parentItems = normalizeIssueSearch(parentResponse, entry.siteUrl);
    }
    const itemsById = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      itemsById.set(item.id, item);
    }
    for (const item of parentItems) {
      if (!itemsById.has(item.id)) {
        itemsById.set(item.id, item);
      }
    }
    const enrichedItems = [...itemsById.values()];

    return {
      items: enrichedItems,
      totalCount: search.total > 0 ? search.total : enrichedItems.length,
      ...(search.hasMore && search.nextPageToken ? { nextCursor: search.nextPageToken } : {}),
    };
  }

  /** Fetch a single issue by id/key, enriched the same way as backlog page
   * items. Reads the issue directly (not via the search index), so it sees
   * issues created moments ago that /search/jql does not return yet. */
  async getBacklogIssue(input: {
    accountId: string;
    issueIdOrKey: string;
  }): Promise<ReturnType<typeof normalizeIssueSearch>[number] | null> {
    const entry = this.getClientForAccount(input.accountId) ?? this.getDefaultClient();
    if (!entry) {
      return null;
    }

    const [estimateField, sprintField] = await Promise.all([
      this.resolveEstimateField(entry.client),
      this.resolveSprintField(entry.client),
    ]);
    const issue = await entry.client.getIssue(input.issueIdOrKey, [
      ...(estimateField ? [estimateField.id] : []),
      ...(sprintField ? [sprintField.id] : []),
      "timeoriginalestimate",
      "timeestimate",
      "aggregatetimeoriginalestimate",
      "aggregatetimeestimate",
    ]);
    return this.toBacklogItem(issue, entry.siteUrl, estimateField, sprintField);
  }

  private toBacklogItem(
    jiraIssue: JiraIssue,
    siteUrl: string,
    estimateField: JiraEstimateField | null,
    sprintField: JiraSprintField | null,
    requestedSprintId?: string,
  ): ReturnType<typeof normalizeIssueSearch>[number] {
    const normalized = normalizeIssueSearch({ issues: [jiraIssue] }, siteUrl)[0]!;
    {
      const normalizedIssueTypeIsSubtask = (
        normalized as typeof normalized & { issueTypeIsSubtask?: boolean }
      ).issueTypeIsSubtask;
      const assigneeAccountId = readJiraAssigneeAccountId(jiraIssue);
      const storyPointsEstimateValue = readJiraEstimateValue(jiraIssue, estimateField);
      const timeTracking = readJiraTimeTracking(jiraIssue);
      const subtaskCount = readJiraSubtaskCount(jiraIssue);
      const sprint = selectJiraPrimarySprint(
        readJiraSprints(jiraIssue, sprintField),
        requestedSprintId ? { sprintId: requestedSprintId } : undefined,
      );
      const estimateValue = issueTypeUsesHourEstimates({
        ...(normalized.type ? { issueType: normalized.type } : {}),
        ...(normalizedIssueTypeIsSubtask !== undefined
          ? { issueTypeIsSubtask: normalizedIssueTypeIsSubtask }
          : {}),
      })
        ? timeTracking.originalEstimateSeconds !== undefined
          ? secondsToRoundedHours(timeTracking.originalEstimateSeconds)
          : undefined
        : storyPointsEstimateValue;

      const item = Object.assign({}, normalized) as Record<string, unknown>;
      if (assigneeAccountId) {
        item.assigneeAccountId = assigneeAccountId;
      }
      if (estimateValue !== undefined) {
        item.estimateValue = estimateValue;
      }
      if (subtaskCount !== undefined) {
        item.subtaskCount = subtaskCount;
      }
      if (timeTracking.originalEstimateSeconds !== undefined) {
        item.timeOriginalEstimateSeconds = timeTracking.originalEstimateSeconds;
      }
      if (timeTracking.remainingEstimateSeconds !== undefined) {
        item.timeRemainingEstimateSeconds = timeTracking.remainingEstimateSeconds;
      }
      if (timeTracking.aggregateOriginalEstimateSeconds !== undefined) {
        item.aggregateTimeOriginalEstimateSeconds = timeTracking.aggregateOriginalEstimateSeconds;
      }
      if (timeTracking.aggregateRemainingEstimateSeconds !== undefined) {
        item.aggregateTimeRemainingEstimateSeconds = timeTracking.aggregateRemainingEstimateSeconds;
      }
      if (sprint) {
        item.sprintId = sprint.id;
        item.sprintName = sprint.name;
        if (sprint.state) {
          item.sprintState = sprint.state;
        }
        if (sprint.boardId) {
          item.sprintBoardId = sprint.boardId;
        }
        if (sprint.goal) {
          item.sprintGoal = sprint.goal;
        }
        if (sprint.startDate) {
          item.sprintStartDate = sprint.startDate;
        }
        if (sprint.endDate) {
          item.sprintEndDate = sprint.endDate;
        }
        if (sprint.completeDate) {
          item.sprintCompleteDate = sprint.completeDate;
        }
      }

      return item as typeof normalized;
    }
  }

  async listProjectStatuses(input: {
    account: IntegrationAccountRef;
    externalProjectId: string;
  }): Promise<ReadonlyArray<AtlassianBacklogBoardColumnStatus>> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) return [];

    const project = await this.findProjectById(input.externalProjectId, entry.client);
    if (!project) {
      return [];
    }

    const statusesByName = new Map<string, AtlassianBacklogBoardColumnStatus>();
    for (const issueType of await entry.client.getProjectStatuses(project.id)) {
      for (const status of issueType.statuses ?? []) {
        const normalizedStatus = toBacklogBoardColumnStatus(status);
        if (!normalizedStatus) {
          continue;
        }

        const dedupeKey = normalizedStatus.name.toLowerCase();
        if (!statusesByName.has(dedupeKey)) {
          statusesByName.set(dedupeKey, normalizedStatus);
        }
      }
    }

    return [...statusesByName.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }

  async getBacklogSelection(input: {
    account: IntegrationAccountRef;
    externalProjectId: string;
    boardId?: string;
    sprintId?: string;
    filterId?: string;
  }): Promise<AtlassianBacklogSelection> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) {
      return { boards: [], sprints: [], savedFilters: [] };
    }

    const project = await this.findProjectById(input.externalProjectId, entry.client);
    if (!project) {
      return { boards: [], sprints: [], savedFilters: [] };
    }

    const [savedFilters, projectBoards] = await Promise.all([
      this.listBacklogSavedFilters(entry.client),
      this.listProjectBoards(entry.client, project),
    ]);
    const listedBoards = projectBoards.boards;
    const selectedFilter = selectBacklogSavedFilter(savedFilters, input.filterId?.trim());
    const participationPreference =
      input.boardId?.trim() || input.sprintId?.trim()
        ? undefined
        : await this.findCurrentUserSprintPreference(entry.client, project.key).catch(
            () => undefined,
          );

    const fallbackCatalog =
      !input.boardId || listedBoards.length === 0 || Boolean(input.sprintId?.trim())
        ? await this.buildProjectSprintCatalog(entry.client, project.key).catch(() => ({
            boards: [],
            sprints: [] as ReadonlyArray<AtlassianBacklogSprint>,
          }))
        : { boards: [], sprints: [] as ReadonlyArray<AtlassianBacklogSprint> };

    const boards = mergeBacklogBoards(listedBoards, fallbackCatalog.boards);
    const requestedSprintBoardId = findSprintBoardId(
      mergeBacklogSprints(fallbackCatalog.sprints, []),
      input.sprintId?.trim(),
    );

    const selectedBoard = selectBacklogBoard(
      boards,
      input.boardId?.trim(),
      requestedSprintBoardId ??
        participationPreference?.boardId ??
        projectBoards.defaultBoardId ??
        fallbackCatalog.sprints[0]?.boardId,
    );
    if (!selectedBoard) {
      const selectedSprint = selectBacklogSprint(fallbackCatalog.sprints, input.sprintId?.trim());
      return {
        boards,
        sprints: fallbackCatalog.sprints,
        savedFilters,
        ...(selectedSprint ? { selectedSprintId: selectedSprint.id } : {}),
        ...(selectedFilter ? { selectedFilterId: selectedFilter.id } : {}),
        ...(selectedFilter ? { selectedFilterJql: selectedFilter.jql } : {}),
      };
    }

    const boardSprints = (
      await entry.client.listBoardSprints(selectedBoard.id).catch(() => ({ values: [] }))
    ).values
      .map((sprint) => toBacklogSprint(sprint))
      .filter((sprint): sprint is AtlassianBacklogSprint => sprint !== undefined)
      .toSorted(compareBacklogSprints);
    const boardConfiguration = await entry.client
      .getBoardConfiguration(selectedBoard.id)
      .catch(() => ({ columnConfig: { columns: [] as const } }));
    const selectedBoardColumns = (boardConfiguration.columnConfig?.columns ?? [])
      .map((column) => toBacklogBoardColumn(column))
      .filter((column): column is AtlassianBacklogBoardColumn => column !== undefined);
    const sprints = mergeBacklogSprints(
      boardSprints,
      filterBacklogSprintsByBoard(fallbackCatalog.sprints, selectedBoard.id),
    );
    const selectedSprint = selectBacklogSprint(
      sprints,
      input.sprintId?.trim() ?? participationPreference?.sprintId,
    );

    return {
      boards,
      sprints,
      savedFilters,
      selectedBoardId: selectedBoard.id,
      ...(selectedBoardColumns && selectedBoardColumns.length > 0 ? { selectedBoardColumns } : {}),
      ...(selectedSprint ? { selectedSprintId: selectedSprint.id } : {}),
      ...(selectedFilter ? { selectedFilterId: selectedFilter.id } : {}),
      ...(selectedFilter ? { selectedFilterJql: selectedFilter.jql } : {}),
    };
  }

  async getBacklogCapabilities(input: {
    account: IntegrationAccountRef;
    externalProjectId: string;
  }): Promise<{
    estimateFieldLabel?: string;
    canCreateSubtasks: boolean;
  }> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) {
      return { canCreateSubtasks: false };
    }

    const estimateField = await this.resolveEstimateField(entry.client);
    const subtaskIssueType = await this.resolveSubtaskIssueType(
      input.externalProjectId,
      entry.client,
    );

    return {
      ...(estimateField ? { estimateFieldLabel: estimateField.label } : {}),
      canCreateSubtasks: subtaskIssueType !== null,
    };
  }

  async searchAssignableUsers(
    accountId: string,
    issueIdOrKey: string,
    query = "",
  ): Promise<ReadonlyArray<{ accountId: string; displayName: string; emailAddress?: string }>> {
    const entry = this.getClientForAccount(accountId) ?? this.getDefaultClient();
    if (!entry) return [];
    const [users, myself] = await Promise.all([
      entry.client.searchAssignableUsers(issueIdOrKey, query),
      entry.client.getMyself().catch(() => null),
    ]);
    if (!myself?.accountId) {
      return users;
    }

    const currentUser: Array<(typeof users)[number]> = [];
    const others: Array<(typeof users)[number]> = [];
    for (const user of users) {
      if (user.accountId === myself.accountId) {
        currentUser.push(user);
      } else {
        others.push(user);
      }
    }
    return [...currentUser, ...others];
  }

  async updateIssueAssignee(
    accountId: string,
    issueIdOrKey: string,
    assigneeAccountId: string | null,
  ): Promise<void> {
    const entry = this.getClientForAccount(accountId) ?? this.getDefaultClient();
    if (!entry) {
      throw new Error("No Jira client available");
    }
    await this.ensureIssueFieldEditable(entry.client, issueIdOrKey, "assignee", "Assignee");
    await entry.client.assignIssue(issueIdOrKey, assigneeAccountId);
  }

  async updateIssueEstimate(
    accountId: string,
    issueIdOrKey: string,
    estimateValue: number | null,
    mode: "points" | "hours" = "points",
  ): Promise<{ label: string }> {
    const entry = this.getClientForAccount(accountId) ?? this.getDefaultClient();
    if (!entry) {
      throw new Error("No Jira client available");
    }

    if (mode === "hours") {
      await this.ensureIssueFieldEditable(entry.client, issueIdOrKey, "timetracking", "Hours");
      await entry.client.updateIssue(issueIdOrKey, {
        timetracking:
          estimateValue === null
            ? { originalEstimate: null }
            : { originalEstimate: formatHoursForJira(estimateValue) },
      });

      return { label: "Hours" };
    }

    const estimateField = await this.resolveEstimateField(entry.client);
    if (!estimateField) {
      throw new Error("No Jira estimate field was detected for this project.");
    }

    await this.ensureIssueFieldEditable(
      entry.client,
      issueIdOrKey,
      estimateField.id,
      estimateField.label,
    );

    await entry.client.updateIssue(issueIdOrKey, {
      [estimateField.id]: estimateValue,
    });

    return { label: estimateField.label };
  }

  async transitionIssueStatus(
    accountId: string,
    issueIdOrKey: string,
    targetStatus: string,
  ): Promise<{ status: string }> {
    const entry = this.getClientForAccount(accountId) ?? this.getDefaultClient();
    if (!entry) {
      throw new Error("No Jira client available");
    }

    const transitions = await entry.client.getIssueTransitions(issueIdOrKey);
    const selectedTransition = selectJiraIssueTransitionForStatus(transitions, targetStatus);
    if (!selectedTransition) {
      const available = formatJiraIssueTransitionNames(transitions);
      throw new Error(
        available
          ? `No Jira transition moves ${issueIdOrKey} into ${targetStatus}. Available transitions: ${available}.`
          : `No Jira transitions are available for ${issueIdOrKey}.`,
      );
    }

    await entry.client.transitionIssue(issueIdOrKey, selectedTransition.id);

    return { status: selectedTransition.to?.name ?? selectedTransition.name };
  }

  async createSubtask(input: {
    accountId: string;
    projectId: string;
    parentIssueIdOrKey: string;
    summary: string;
    description?: string;
    estimateHours?: number;
  }): Promise<{ id: string; key: string }> {
    const entry = this.getClientForAccount(input.accountId) ?? this.getDefaultClient();
    if (!entry) {
      throw new Error("No Jira client available");
    }

    const subtaskIssueType = await this.resolveSubtaskIssueType(input.projectId, entry.client);
    if (!subtaskIssueType) {
      throw new Error("No Jira subtask issue type was detected for this project.");
    }

    const trimmedDescription = input.description?.trim();
    const estimateHours = input.estimateHours;
    if (estimateHours !== undefined && (!Number.isFinite(estimateHours) || estimateHours < 0)) {
      throw new Error("Estimated hours must be a non-negative number.");
    }

    const fields: Record<string, unknown> = {
      project: { id: input.projectId },
      parent: { key: input.parentIssueIdOrKey },
      summary: input.summary,
      issuetype: { id: subtaskIssueType.id },
    };

    if (trimmedDescription && hasCreateMetaField(subtaskIssueType, "description")) {
      fields.description = buildPlainTextAdfDocument(trimmedDescription);
    }

    if (estimateHours !== undefined && hasCreateMetaField(subtaskIssueType, "timetracking")) {
      fields.timetracking = {
        originalEstimate: formatHoursForJira(estimateHours),
      };
    }

    const created = await entry.client.createIssue(fields);

    return { id: created.id, key: created.key };
  }

  async getResource(ref: unknown): Promise<ResourceSnapshot> {
    const typedRef = ref as {
      id: string;
      provider: string;
      kind: string;
      projectId?: string;
      url?: string;
    };
    const entry = this.getDefaultClient();
    if (!entry) throw new Error("No Jira client available");
    const issue = await entry.client.getIssue(typedRef.id);
    return normalizeIssue(issue, entry.siteUrl);
  }

  async downloadAsset(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
    const entry = this.getDefaultClient();
    if (!entry) throw new Error("No Jira client available");
    return entry.client.downloadAsset(url);
  }

  async search(input: IntegrationSearchInput): Promise<ReadonlyArray<ResourceSearchResult>> {
    const entry = this.getClientForAccount(input.account.id) ?? this.getDefaultClient();
    if (!entry) return [];

    const projectKey = input.externalProjectId
      ? (await this.findProjectById(input.externalProjectId, entry.client))?.key
      : undefined;

    const textQuery = input.query.trim();
    if (!textQuery) return [];

    const jqlParts: string[] = [];
    if (projectKey) {
      const quotedProjectKey = projectKey.replace(/"/g, '\\"');
      jqlParts.push(`project = "${quotedProjectKey}"`);
    }
    jqlParts.push(`text ~ "${textQuery.replace(/"/g, '\\"')}"`);
    const jql = jqlParts.join(" AND ");

    const response = await entry.client.searchIssues(jql, input.limit ?? 20);
    const items = normalizeIssueSearch(response, entry.siteUrl);

    return items.map((item) => ({
      ref: item,
    }));
  }

  async getAvailableActions(_ref: unknown): Promise<ReadonlyArray<IntegrationAction>> {
    return [
      {
        id: "jira.comment.prepare",
        label: "Prepare Jira comment",
        kind: "mutate",
        requiresApproval: true,
      },
    ];
  }

  async prepareMutation(input: PrepareMutationInput): Promise<PreparedMutation> {
    return {
      mutationId: crypto.randomUUID(),
      preview: `Add comment to issue`,
      editableFields: ["body"],
      payload: input.payload,
    };
  }

  async commitMutation(input: CommitMutationInput): Promise<MutationResult> {
    const payload = input.approvedPayload as { issueId?: string; body?: string };
    if (!payload.issueId || !payload.body) {
      return { success: false, errorMessage: "Missing issueId or body" };
    }

    const entry = this.getDefaultClient();
    if (!entry) {
      return { success: false, errorMessage: "No Jira client available" };
    }

    try {
      await entry.client.addIssueComment(payload.issueId, payload.body);
      return {
        success: true,
        externalUrl: `${entry.siteUrl}/browse/${payload.issueId}`,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Failed to post comment",
      };
    }
  }

  private async findProjectById(
    projectId: string,
    client: JiraApiClient,
  ): Promise<{ id: string; key: string } | null> {
    const projects = await client.searchProjects();
    const match = projects.values.find((p) => p.id === projectId);
    if (!match) return null;
    return { id: match.id, key: match.key };
  }

  // /rest/api/3/search/jql pages via nextPageToken; it ignores startAt and
  // does not return total. The token is the only valid continuation handle.
  private async searchIssuesWithPagination(
    client: JiraApiClient,
    jql: string,
    extraFields: ReadonlyArray<string>,
    limit?: number,
    initialPageToken?: string,
  ): Promise<{
    issues: ReadonlyArray<unknown>;
    total: number;
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    const requestedLimit =
      typeof limit === "number" && Number.isFinite(limit)
        ? Math.max(0, Math.floor(limit))
        : undefined;
    if (requestedLimit === 0) {
      return { issues: [], total: 0, hasMore: false };
    }

    const issues: unknown[] = [];
    let pageToken = initialPageToken;
    let total = 0;

    while (true) {
      const remaining =
        requestedLimit === undefined ? jiraIssueSearchPageSize : requestedLimit - issues.length;
      const pageSize = Math.min(jiraIssueSearchPageSize, remaining);
      if (pageSize <= 0) {
        break;
      }

      const response = await client.searchIssues(jql, pageSize, extraFields, pageToken);
      const pageIssues = response.issues.slice(0, pageSize);
      issues.push(...pageIssues);
      if (typeof response.total === "number") {
        total = response.total;
      }

      const exhausted =
        pageIssues.length === 0 || response.isLast === true || !response.nextPageToken;
      const reachedRequestedLimit = requestedLimit !== undefined && issues.length >= requestedLimit;
      if (exhausted) {
        return { issues, total, hasMore: false };
      }
      if (reachedRequestedLimit) {
        return {
          issues,
          total,
          nextPageToken: response.nextPageToken,
          hasMore: true,
        };
      }

      pageToken = response.nextPageToken;
    }

    return { issues, total, hasMore: false };
  }

  private async resolveEstimateField(client: JiraApiClient): Promise<JiraEstimateField | null> {
    try {
      return findJiraEstimateField(await client.listFields());
    } catch {
      return null;
    }
  }

  private async resolveSprintField(client: JiraApiClient): Promise<JiraSprintField | null> {
    try {
      return findJiraSprintField(await client.listFields());
    } catch {
      return null;
    }
  }

  private async listBacklogSavedFilters(
    client: JiraApiClient,
  ): Promise<ReadonlyArray<AtlassianBacklogSavedFilter>> {
    try {
      const favourites = (await client.listFavouriteFilters())
        .map((filter) => toBacklogSavedFilter(filter))
        .filter((filter): filter is AtlassianBacklogSavedFilter => filter !== undefined)
        .toSorted(compareBacklogSavedFilters);

      if (favourites.length > 0) {
        return favourites;
      }
    } catch {
      // Saved filters are an optional enhancement; keep the backlog usable if Jira rejects this.
    }

    try {
      return (await client.searchFilters()).values
        .map((filter) => toBacklogSavedFilter(filter))
        .filter((filter): filter is AtlassianBacklogSavedFilter => filter !== undefined)
        .toSorted(compareBacklogSavedFilters)
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  private async listProjectBoards(
    client: JiraApiClient,
    project: { id: string; key: string },
  ): Promise<{
    boards: ReadonlyArray<AtlassianBacklogBoard>;
    defaultBoardId?: string;
  }> {
    const projectIdentifiers = [...new Set([project.key.trim(), project.id.trim()])].filter(
      (identifier) => identifier.length > 0,
    );

    const listedBoardsById = new Map<string, AtlassianBacklogBoard>();
    let defaultBoardId: string | undefined;

    for (const projectIdentifier of projectIdentifiers) {
      const response = await client.listBoards(projectIdentifier).catch(() => ({ values: [] }));
      for (const board of response.values) {
        const listedBoard = toBacklogBoard(board);
        if (!listedBoard) {
          continue;
        }

        if (!listedBoardsById.has(listedBoard.id)) {
          listedBoardsById.set(listedBoard.id, listedBoard);
          if (!defaultBoardId) {
            defaultBoardId = listedBoard.id;
          }
          continue;
        }

        const existing = listedBoardsById.get(listedBoard.id)!;
        listedBoardsById.set(listedBoard.id, {
          id: listedBoard.id,
          name: listedBoard.name,
          ...((existing.type ?? listedBoard.type)
            ? { type: existing.type ?? listedBoard.type }
            : {}),
        });
      }
    }

    return {
      boards: [...listedBoardsById.values()],
      ...(defaultBoardId ? { defaultBoardId } : {}),
    };
  }

  private async buildProjectSprintCatalog(
    client: JiraApiClient,
    projectKey: string,
  ): Promise<{
    boards: ReadonlyArray<AtlassianBacklogBoard>;
    sprints: ReadonlyArray<AtlassianBacklogSprint>;
  }> {
    const sprintField = await this.resolveSprintField(client);
    if (!sprintField) {
      return { boards: [], sprints: [] };
    }

    const quotedProjectKey = projectKey.replace(/"/g, '\\"');
    const sprintQueries = [
      `project = "${quotedProjectKey}" AND Sprint in openSprints() ORDER BY updated DESC`,
      `project = "${quotedProjectKey}" AND Sprint in futureSprints() ORDER BY updated DESC`,
      `project = "${quotedProjectKey}" AND Sprint is not EMPTY ORDER BY updated DESC`,
    ];
    const issuesById = new Map<string, unknown>();

    for (const [index, jql] of sprintQueries.entries()) {
      try {
        const response = await client.searchIssues(jql, 100, [sprintField.id]);
        for (const issue of response.issues) {
          const issueId = readJiraIssueIdentity(issue);
          if (!issueId || issuesById.has(issueId)) {
            continue;
          }
          issuesById.set(issueId, issue);
        }
      } catch (cause) {
        if (index === sprintQueries.length - 1) {
          throw cause;
        }
      }
    }

    const sprints = collectIssueBacklogSprints([...issuesById.values()], sprintField);
    if (sprints.length === 0) {
      return { boards: [], sprints: [] };
    }

    const boardIds = [
      ...new Set(sprints.flatMap((sprint) => (sprint.boardId ? [sprint.boardId] : []))),
    ];
    const boards = await Promise.all(
      boardIds.map(async (boardId) => {
        try {
          return toBacklogBoard(await client.getBoard(boardId));
        } catch {
          return { id: boardId, name: `Board ${boardId}` } satisfies AtlassianBacklogBoard;
        }
      }),
    );

    return {
      boards: boards
        .filter((board): board is AtlassianBacklogBoard => board !== undefined)
        .toSorted(compareBacklogBoards),
      sprints,
    };
  }

  private async findCurrentUserSprintPreference(
    client: JiraApiClient,
    projectKey: string,
  ): Promise<{
    boardId?: string;
    sprintId?: string;
  }> {
    const sprintField = await this.resolveSprintField(client);
    if (!sprintField) {
      return {};
    }

    const quotedProjectKey = projectKey.replace(/"/g, '\\"');
    const response = await client.searchIssues(
      `project = "${quotedProjectKey}" AND assignee = currentUser() AND Sprint in openSprints() ORDER BY updated DESC`,
      50,
      [sprintField.id],
    );

    const sprintCounts = new Map<
      string,
      {
        sprint: AtlassianBacklogSprint;
        issueCount: number;
      }
    >();

    for (const issue of response.issues) {
      const primarySprint = selectJiraPrimarySprint(
        readJiraSprints(issue as JiraIssue, sprintField),
      );
      if (!primarySprint) {
        continue;
      }

      const sprint = toBacklogSprint(primarySprint);
      if (!sprint) {
        continue;
      }

      const existing = sprintCounts.get(sprint.id);
      sprintCounts.set(sprint.id, {
        sprint: existing ? (mergeBacklogSprints([sprint], [existing.sprint])[0] ?? sprint) : sprint,
        issueCount: (existing?.issueCount ?? 0) + 1,
      });
    }

    const preferredSprint = selectPreferredParticipantSprint([...sprintCounts.values()]);
    if (!preferredSprint) {
      return {};
    }

    return {
      ...(preferredSprint.boardId ? { boardId: preferredSprint.boardId } : {}),
      sprintId: preferredSprint.id,
    };
  }

  private async ensureIssueFieldEditable(
    client: JiraApiClient,
    issueIdOrKey: string,
    fieldId: string,
    fieldLabel: string,
  ): Promise<void> {
    const editMeta = await client.getIssueEditMeta(issueIdOrKey);
    if (Object.prototype.hasOwnProperty.call(editMeta.fields ?? {}, fieldId)) {
      return;
    }

    throw new Error(
      `${fieldLabel} is not editable for ${issueIdOrKey}. Add it to the Jira edit screen for this issue type or update it directly in Jira.`,
    );
  }

  private async resolveSubtaskIssueType(
    projectId: string,
    client: JiraApiClient,
  ): Promise<{ id: string; name: string; fields?: Record<string, unknown> } | null> {
    try {
      const createMeta = await client.getCreateMeta(projectId);
      const issueTypes = createMeta.projects?.flatMap((project) => project.issuetypes ?? []) ?? [];
      const match = issueTypes.find(
        (issueType) => issueType.subtask === true || /sub-task|subtask/i.test(issueType.name),
      );

      return match
        ? {
            id: match.id,
            name: match.name,
            ...(match.fields ? { fields: match.fields } : {}),
          }
        : null;
    } catch {
      return null;
    }
  }
}
