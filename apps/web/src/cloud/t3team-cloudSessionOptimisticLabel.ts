/** Label after a click: pending wins, then the idle wording. */
export function optimisticActionLabel(
  pending: boolean,
  idle: string,
  pendingLabel: string,
): string {
  return pending ? pendingLabel : idle;
}
