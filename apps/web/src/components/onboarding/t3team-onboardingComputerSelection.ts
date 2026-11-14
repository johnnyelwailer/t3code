/**
 * A discovered (T3 Connect) computer the connect list may tick for the user: only one whose relay
 * reports it online. Offline or failing relays stay unticked.
 */
export function shouldAutoSelectDiscoveredComputer(availability: string): boolean {
  return availability === "online";
}
