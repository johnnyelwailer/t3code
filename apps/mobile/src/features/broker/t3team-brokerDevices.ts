import {
  BROKER_HOST_KEY_PREFIX,
  type BrokerHost,
  type BrokerSession,
} from "@t3tools/shared/t3team-nexiBrokerClient";

/**
 * What the broker knows of the user's devices, in one list: the machines they enrolled (a desktop,
 * a headless box) and their running cloud sessions. The broker keys both in one namespace, so a
 * device's `key` is what attach, pairing and the proxy address it by.
 */
export interface BrokerDevice {
  /** A cloud session's run id, or `h-<hostId>` for an enrolled machine. */
  readonly key: string;
  readonly kind: "machine" | "cloudSession";
  readonly label: string;
  readonly online: boolean;
  /** Online since (a session) or last seen (a machine), ISO 8601; null when the broker has none. */
  readonly seenAt: string | null;
  /** The environment it serves; null until a cloud session's server is up, or for a machine. */
  readonly environmentId: string | null;
}

export const brokerHostKey = (hostId: string) => `${BROKER_HOST_KEY_PREFIX}${hostId}`;

export const isBrokerHostKey = (key: string) => key.startsWith(BROKER_HOST_KEY_PREFIX);

const machineOf = (host: BrokerHost): BrokerDevice => ({
  key: brokerHostKey(host.id),
  kind: "machine",
  label: host.label,
  online: host.online,
  seenAt: host.lastSeen ?? null,
  environmentId: null,
});

const cloudSessionOf = (session: BrokerSession): BrokerDevice => ({
  key: session.runId,
  kind: "cloudSession",
  label: session.label ?? session.repository ?? "Cloud session",
  online: true,
  seenAt: session.since ?? null,
  environmentId: session.environmentId ?? null,
});

const newestFirst = (a: BrokerDevice, b: BrokerDevice) =>
  (b.seenAt ?? "").localeCompare(a.seenAt ?? "");

/** Online machines first, then offline ones, then cloud sessions, newest first within each. */
export function brokerDevices(
  hosts: ReadonlyArray<BrokerHost>,
  sessions: ReadonlyArray<BrokerSession>,
): ReadonlyArray<BrokerDevice> {
  const machines = hosts.map(machineOf);
  return [
    ...machines.filter((device) => device.online).sort(newestFirst),
    ...machines.filter((device) => !device.online).sort(newestFirst),
    ...sessions.map(cloudSessionOf).sort(newestFirst),
  ];
}
