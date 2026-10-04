/**
 * A cloud session's hold (how long the machine is kept) as a compact tag —
 * "4h", "45m", "1h 30m" — for labels that name the duration an action will
 * use, like the Run-on menu's "New cloud session · 4h". Distinct from
 * `formatDuration`, which renders elapsed time down to the second.
 */
export function formatHoldDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
