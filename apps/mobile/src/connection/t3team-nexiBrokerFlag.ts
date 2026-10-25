/**
 * Tracks the runtime-toggleable NEXI_MOBILE_BROKER flag. Turning it off closes the tunnels; turning it
 * back on wakes the shared connection supervisor, because connections that retried while it was off
 * were refused as blocked and are parked until some wakeup arrives.
 */
export function createBrokerFlagWatcher(
  initiallyEnabled: boolean,
  deps: { closeTunnels: () => void; wake: () => void },
) {
  let enabled = initiallyEnabled;
  return (next: boolean) => {
    const previous = enabled;
    enabled = next;
    if (!next) deps.closeTunnels();
    else if (!previous) deps.wake();
  };
}
