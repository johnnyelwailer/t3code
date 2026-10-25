import { subscribeNexiAccountChanges } from "../features/connection/t3team-nexiAccount";
import { createNexiWakeups } from "./t3team-nexiWakeHub";

const wakeups = createNexiWakeups(subscribeNexiAccountChanges);
/** Wakes parked broker connections; it never restarts a healthy connection. */
export const wakeNexiBrokerConnections = wakeups.wakeBroker;
export const nexiAccountChanges = wakeups.changes;
