export function formatAbsoluteTimestamp(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) return undefined;
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toLocaleString();
}

export function renderRelativeTimestamp(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) return undefined;
  if (!Number.isFinite(timestamp)) return undefined;
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function formatLastCheckedAt(lastCheckedAt: number | undefined): string | undefined {
  const relative = renderRelativeTimestamp(lastCheckedAt);
  const absolute = formatAbsoluteTimestamp(lastCheckedAt);
  if (!relative) return absolute;
  return absolute ? `${relative} (${absolute})` : relative;
}
