import type { NexiHostWithSeen, NexiStartInput } from "./t3team-nexiStartModel";

/** Fixed clock so last-seen text is stable in tests and screenshots. */
export const FIXTURE_NOW = Date.parse("2026-10-25T10:00:00.000Z");
const ago = (minutes: number) => new Date(FIXTURE_NOW - minutes * 60_000).toISOString();

/** Shaped like the broker's `GET /v1/hosts` rows (nexi-work/broker/src/broker.ts listHosts). */
export const FIXTURE_HOSTS: readonly NexiHostWithSeen[] = [
  { id: "h-3f9a01c2", label: "PJ's MacBook Pro", online: true, lastSeen: ago(0) },
  { id: "h-7be4d9a0", label: "Mac Studio (office)", online: true, lastSeen: ago(1) },
  { id: "h-c1d2e3f4", label: "Build Mac mini", online: false, lastSeen: ago(190) },
];

export const FIXTURE_BASE: NexiStartInput = {
  enabled: true,
  signedIn: true,
  deviceCodePending: false,
  hosts: FIXTURE_HOSTS,
  busy: false,
  connectingHostId: null,
  error: null,
  offline: false,
  now: FIXTURE_NOW,
};

const base = (patch: Partial<NexiStartInput>): NexiStartInput => ({ ...FIXTURE_BASE, ...patch });

/** Named screens for the model table test and the dev-only on-device preview. */
export const START_FIXTURES = {
  loading: base({ signedIn: null }),
  "signed-out": base({ signedIn: false, hosts: null }),
  "signed-out-expired": base({
    signedIn: false,
    hosts: null,
    error: { kind: "auth", message: "Sign in to Nexplore again." },
  }),
  "no-hosts": base({ hosts: [] }),
  hosts: base({}),
  "hosts-offline-network": base({ offline: true }),
  "broker-404": base({
    hosts: null,
    error: {
      kind: "broker",
      message:
        "The broker is unavailable (HTTP 404). Check host enrollment and broker host support.",
    },
  }),
  "long-names": base({
    hosts: [
      {
        id: "h-aaaa0001",
        label:
          "Anna-Katharina Schwarzenbacher-Müller's extraordinarily long named MacBook Pro 16-inch",
        online: true,
        lastSeen: ago(0),
      },
      { id: "h-aaaa0002", label: "山田のMac Studio 🖥️", online: false, lastSeen: ago(60 * 30) },
      { id: "h-aaaa0003", label: "Build Mac mini", online: false },
    ],
  }),
} as const satisfies Record<string, NexiStartInput>;

export type NexiStartFixtureName = keyof typeof START_FIXTURES;
