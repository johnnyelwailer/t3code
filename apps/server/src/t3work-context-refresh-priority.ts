export type T3workContextRefreshQueueItem = {
  readonly resourceKey: string;
  readonly depth: number;
  readonly enqueuedAt: number;
  readonly staleSince?: number;
  readonly failureCount?: number;
  readonly estimatedSizeBytes?: number;
};

export function compareT3workContextRefreshPriority(
  left: T3workContextRefreshQueueItem,
  right: T3workContextRefreshQueueItem,
): number {
  if (left.depth !== right.depth) {
    return left.depth - right.depth;
  }
  const staleDelta =
    (left.staleSince ?? Number.MAX_SAFE_INTEGER) - (right.staleSince ?? Number.MAX_SAFE_INTEGER);
  if (staleDelta !== 0) {
    return staleDelta;
  }
  const failureDelta = (left.failureCount ?? 0) - (right.failureCount ?? 0);
  if (failureDelta !== 0) {
    return failureDelta;
  }
  const sizeDelta =
    (left.estimatedSizeBytes ?? Number.MAX_SAFE_INTEGER) -
    (right.estimatedSizeBytes ?? Number.MAX_SAFE_INTEGER);
  if (sizeDelta !== 0) {
    return sizeDelta;
  }
  return left.enqueuedAt - right.enqueuedAt;
}

export function sortT3workContextRefreshQueue<T extends T3workContextRefreshQueueItem>(
  items: ReadonlyArray<T>,
): T[] {
  return [...items].toSorted(compareT3workContextRefreshPriority);
}

export function shouldPreemptT3workContextRefresh(input: {
  readonly current: T3workContextRefreshQueueItem;
  readonly incoming: T3workContextRefreshQueueItem;
}): boolean {
  return compareT3workContextRefreshPriority(input.incoming, input.current) < 0;
}
