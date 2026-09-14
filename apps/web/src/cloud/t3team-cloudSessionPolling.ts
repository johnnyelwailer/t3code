/**
 * Polling the cloud session list while a menu is open.
 *
 * The list atom carries no refresh interval of its own (owner decision: be
 * conservative with GHE calls), so the 5-second cadence that keeps a
 * provisioning session's phases ticking forward lives on the surface that is
 * actually showing it. Opening the surface refreshes once immediately — a
 * menu must not open on data that is seconds old — and then the list is
 * re-pulled on the interval until the surface closes.
 */
export function startCloudSessionListPolling(
  refresh: () => void,
  intervalMs: number,
): () => void {
  refresh();
  const timer = setInterval(() => refresh(), intervalMs);
  return () => {
    clearInterval(timer);
  };
}
