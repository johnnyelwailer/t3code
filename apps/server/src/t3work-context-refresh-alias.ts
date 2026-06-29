import {
  collectWorkItemTicketAliases,
  normalizeTicketKey,
  type WorkItemsIndex,
} from "./t3work-toolBrokerContextSyncScope.ts";

type WorkItemSummaryByRelativePath = ReadonlyMap<string, Record<string, unknown> | undefined>;

function findIndexedItem(index: WorkItemsIndex, normalizedKey: string) {
  return index.workItems?.find(
    (item) => typeof item.key === "string" && normalizeTicketKey(item.key) === normalizedKey,
  );
}

export function findIndexedWorkItem(input: {
  readonly index: WorkItemsIndex;
  readonly normalizedKey: string;
  readonly summaryByRelativePath: WorkItemSummaryByRelativePath;
}) {
  const direct = findIndexedItem(input.index, input.normalizedKey);
  if (direct?.ticketEntryPointRelativePath) {
    return direct;
  }

  for (const item of input.index.workItems ?? []) {
    if (!item.relativePath) {
      continue;
    }
    const aliases = new Set<string>();
    if (typeof item.key === "string") {
      aliases.add(normalizeTicketKey(item.key));
    }
    for (const alias of collectWorkItemTicketAliases(
      input.summaryByRelativePath.get(item.relativePath)?.ticket,
    )) {
      aliases.add(alias);
    }
    if (aliases.has(input.normalizedKey)) {
      return item;
    }
  }

  return undefined;
}
