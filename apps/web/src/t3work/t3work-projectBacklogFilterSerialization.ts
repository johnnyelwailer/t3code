import {
  defaultProjectBacklogAssigneeFilterScope,
  defaultProjectBacklogVisibleIssueTypes,
  projectBacklogAssigneeFilterScopeOptions,
  projectBacklogIssueTypeFilterOptions,
  type ProjectBacklogAssigneeFilterScope,
  type ProjectBacklogAssigneeFilterScopeKey,
  type ProjectBacklogIssueTypeFilterKey,
} from "~/t3work/t3work-projectBacklogFilterOptions";

export function parseProjectBacklogVisibleIssueTypes(
  value: unknown,
): ReadonlyArray<ProjectBacklogIssueTypeFilterKey> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowed = new Set(projectBacklogIssueTypeFilterOptions.map((option) => option.value));
  const parsed = value.filter(
    (entry): entry is ProjectBacklogIssueTypeFilterKey =>
      typeof entry === "string" && allowed.has(entry as ProjectBacklogIssueTypeFilterKey),
  );
  const deduped = [...new Set(parsed)];
  return deduped.length > 0 ? deduped : undefined;
}

export function parseProjectBacklogVisibleIssueTypesRouteValue(
  value: string | undefined,
): ReadonlyArray<ProjectBacklogIssueTypeFilterKey> | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return parseProjectBacklogVisibleIssueTypes(value.split(",").map((entry) => entry.trim()));
}

export function serializeProjectBacklogVisibleIssueTypesRouteValue(
  values: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>,
): string | undefined {
  const parsed =
    parseProjectBacklogVisibleIssueTypes(values) ?? defaultProjectBacklogVisibleIssueTypes;
  if (
    parsed.length === defaultProjectBacklogVisibleIssueTypes.length &&
    defaultProjectBacklogVisibleIssueTypes.every((value) => parsed.includes(value))
  ) {
    return undefined;
  }
  return parsed.join(",");
}

export function parseProjectBacklogSelectedLabels(
  value: unknown,
): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
  const deduped = [...new Set(parsed)];
  return deduped.length > 0 ? deduped : undefined;
}

export function parseProjectBacklogSelectedLabelsRouteValue(
  value: string | undefined,
): ReadonlyArray<string> | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return parseProjectBacklogSelectedLabels(value.split(",").map((entry) => entry.trim()));
}

export function serializeProjectBacklogSelectedLabelsRouteValue(
  values: ReadonlyArray<string>,
): string | undefined {
  const parsed = parseProjectBacklogSelectedLabels(values);
  return parsed?.join(",");
}

export function parseProjectBacklogSelectedQuickFilterIds(
  value: unknown,
): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
  const deduped = [...new Set(parsed)];
  return deduped.length > 0 ? deduped : undefined;
}

export function parseProjectBacklogSelectedQuickFilterIdsRouteValue(
  value: string | undefined,
): ReadonlyArray<string> | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return parseProjectBacklogSelectedQuickFilterIds(value.split(",").map((entry) => entry.trim()));
}

export function serializeProjectBacklogSelectedQuickFilterIdsRouteValue(
  values: ReadonlyArray<string>,
): string | undefined {
  const parsed = parseProjectBacklogSelectedQuickFilterIds(values);
  return parsed?.join(",");
}

export function parseProjectBacklogAssigneeFilterScope(
  value: unknown,
): ProjectBacklogAssigneeFilterScope {
  if (!value || typeof value !== "object") {
    return { ...defaultProjectBacklogAssigneeFilterScope };
  }

  const parsed = value as Partial<Record<ProjectBacklogAssigneeFilterScopeKey, unknown>>;
  return {
    epic: parsed.epic === true,
    story: parsed.story !== false,
    subtask: parsed.subtask === true,
  };
}

export function parseProjectBacklogAssigneeFilterScopeRouteValue(
  value: string | undefined,
): ProjectBacklogAssigneeFilterScope | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const enabled = new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry): entry is ProjectBacklogAssigneeFilterScopeKey =>
        projectBacklogAssigneeFilterScopeOptions.some((option) => option.value === entry),
      ),
  );

  if (enabled.size === 0) {
    return undefined;
  }

  return {
    epic: enabled.has("epic"),
    story: enabled.has("story"),
    subtask: enabled.has("subtask"),
  };
}

export function serializeProjectBacklogAssigneeFilterScopeRouteValue(
  scope: ProjectBacklogAssigneeFilterScope,
): string | undefined {
  const enabled = projectBacklogAssigneeFilterScopeOptions
    .filter((option) => scope[option.value])
    .map((option) => option.value);

  if (enabled.length === 1 && enabled[0] === "story") {
    return undefined;
  }

  return enabled.join(",");
}

export function areProjectBacklogAssigneeFilterScopesEqual(
  left: ProjectBacklogAssigneeFilterScope,
  right: ProjectBacklogAssigneeFilterScope,
): boolean {
  return left.epic === right.epic && left.story === right.story && left.subtask === right.subtask;
}
