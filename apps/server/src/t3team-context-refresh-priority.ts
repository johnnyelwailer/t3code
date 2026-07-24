export type T3TeamContextRefreshQueueItem = {
  readonly resourceKey: string;
  readonly depth: number;
  readonly enqueuedAt: number;
  readonly staleSince?: number;
  readonly failureCount?: number;
  readonly estimatedSizeBytes?: number;
};

export function compareT3TeamContextRefreshPriority(
  left: T3TeamContextRefreshQueueItem,
  right: T3TeamContextRefreshQueueItem,
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

export function sortT3TeamContextRefreshQueue<T extends T3TeamContextRefreshQueueItem>(
  items: ReadonlyArray<T>,
): T[] {
  return [...items].toSorted(compareT3TeamContextRefreshPriority);
}

export function shouldPreemptT3TeamContextRefresh(input: {
  readonly current: T3TeamContextRefreshQueueItem;
  readonly incoming: T3TeamContextRefreshQueueItem;
}): boolean {
  return compareT3TeamContextRefreshPriority(input.incoming, input.current) < 0;
}
