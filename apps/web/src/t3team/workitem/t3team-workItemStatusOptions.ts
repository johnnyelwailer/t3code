import type { AtlassianBacklogBoardColumnStatus } from "~/t3team/backend/t3team-types";

export type WorkItemStatusOption = {
  readonly name: string;
  readonly id?: string;
};

/**
 * Builds the deduplicated, ordered list of statuses the status control offers.
 *
 * The board's own available statuses are the primary source. The issue's current status is always
 * included even when the board doesn't list it — a custom workflow transition, or a status the
 * board's column filter hides, would otherwise make the current value vanish from its own picker.
 */
export function buildWorkItemStatusOptions(
  availableStatuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>,
  currentStatusName: string | undefined,
): ReadonlyArray<WorkItemStatusOption> {
  const seen = new Set<string>();
  const options: WorkItemStatusOption[] = [];

  for (const status of availableStatuses) {
    const name = status.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    options.push({ name, ...(status.id ? { id: status.id } : {}) });
  }

  const trimmedCurrent = currentStatusName?.trim();
  if (trimmedCurrent && !seen.has(trimmedCurrent.toLowerCase())) {
    options.push({ name: trimmedCurrent });
  }

  return options;
}
