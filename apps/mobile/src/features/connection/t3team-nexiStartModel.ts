import type { NexiHost } from "../../connection/t3team-nexiBrokerClient";
import { relativeTime } from "../../lib/time";
import type { NexiStartError } from "./t3team-nexiStartError";

/** Everything the start screen depends on, as plain data. */
export interface NexiStartInput {
  /** NEXI_MOBILE_BROKER, from the build preset or a paired server. */
  readonly enabled: boolean;
  /** `null` while the stored Entra token is still being checked. */
  readonly signedIn: boolean | null;
  /** A device-code sign-in is waiting for the user at Microsoft. */
  readonly deviceCodePending: boolean;
  /** `null` until the broker has answered `GET /v1/hosts` once. */
  readonly hosts: readonly NexiHost[] | null;
  /** A request (sign-in, host list, connect) is in flight. */
  readonly busy: boolean;
  readonly connectingHostId: string | null;
  readonly error: NexiStartError | null;
  readonly offline: boolean;
  readonly now: number;
}

export type NexiStartActionId = "sign-in" | "refresh" | "sign-out" | "pair";
export interface NexiStartAction {
  readonly id: NexiStartActionId;
  readonly label: string;
  readonly tone: "primary" | "secondary" | "text";
  readonly disabled: boolean;
  readonly busy: boolean;
}

export type NexiPresence = "online" | "offline" | "unknown";
export interface NexiHostRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly presence: NexiPresence;
  readonly connecting: boolean;
  readonly disabled: boolean;
}

export type NexiStartMode =
  | "loading"
  | "unavailable"
  | "signed-out"
  | "device-code"
  | "load-failed"
  | "no-hosts"
  | "hosts";

export interface NexiStartModel {
  readonly mode: NexiStartMode;
  readonly title: string | null;
  readonly body: string | null;
  readonly banner: string | null;
  readonly hosts: readonly NexiHostRow[];
  readonly actions: readonly NexiStartAction[];
}

const OFFLINE_BANNER = "No internet connection.";
const PAIR_LABEL = "Connect with a pairing link or QR";
const ENROL_STEPS =
  "On your Mac, open Nexi Work and turn on Settings > Connections > Reachable via Nexi broker, then refresh.";

const action = (
  id: NexiStartActionId,
  label: string,
  tone: NexiStartAction["tone"],
  extra: { readonly disabled?: boolean; readonly busy?: boolean } = {},
): NexiStartAction => ({
  id,
  label,
  tone,
  disabled: extra.disabled ?? false,
  busy: extra.busy ?? false,
});

const cleanLabel = (label: string) => label.replace(/\s+/g, " ").trim() || "Unnamed desktop";
const labelKey = (label: string) => cleanLabel(label).toLocaleLowerCase();
const PRESENCE_ORDER: Record<NexiPresence, number> = { online: 0, unknown: 1, offline: 2 };

function hostRows(input: NexiStartInput, stale: boolean): readonly NexiHostRow[] {
  const hosts = input.hosts ?? [];
  const counts = new Map<string, number>();
  for (const host of hosts)
    counts.set(labelKey(host.label), (counts.get(labelKey(host.label)) ?? 0) + 1);
  const frozen = input.connectingHostId !== null || input.offline;
  const rows = hosts.map((host) => {
    const unreachable = input.error?.kind === "host" && input.error.hostId === host.id;
    const presence: NexiPresence =
      stale || unreachable ? "unknown" : host.online ? "online" : "offline";
    const seen = host.lastSeen ? ` · last seen ${relativeTime(host.lastSeen, input.now)} ago` : "";
    const duplicate =
      (counts.get(labelKey(host.label)) ?? 0) > 1 ? ` · ID ${host.id.slice(-4)}` : "";
    const status =
      input.connectingHostId === host.id
        ? "Connecting…"
        : presence === "online"
          ? "Online"
          : presence === "offline"
            ? `Offline${seen}`
            : "Status unknown";
    return {
      id: host.id,
      title: cleanLabel(host.label),
      status: `${status}${duplicate}`,
      presence,
      connecting: input.connectingHostId === host.id,
      disabled: frozen || input.busy || presence === "offline",
    };
  });
  return rows.sort(
    (a, b) =>
      PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] ||
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}

function errorBanner(input: NexiStartInput, prefix = ""): string | null {
  const error = input.error;
  if (!error) return input.offline ? OFFLINE_BANNER : null;
  if (error.kind === "auth") return `${prefix}Your Nexplore sign-in expired. Sign in again.`;
  if (error.kind === "host") {
    const label = input.hosts?.find((host) => host.id === error.hostId)?.label;
    return `${cleanLabel(label ?? "That desktop")} could not be reached; it may have gone offline. Refresh to check. ${error.message}`;
  }
  return `${prefix}${error.message}`;
}

/** Maps the account, flag, broker and network state to what the Android start screen shows. */
export function deriveNexiStartModel(input: NexiStartInput): NexiStartModel {
  const empty = { title: null, body: null, banner: null, hosts: [] as const };
  const signOut = action("sign-out", "Sign out of Nexplore", "text", { disabled: input.busy });
  const pair = action("pair", PAIR_LABEL, "text");
  if (!input.enabled)
    return {
      ...empty,
      mode: "unavailable",
      title: "Pair a desktop to start",
      body: "Entra sign-in switches on after a paired desktop enables Nexi Work mobile broker in Settings > Features.",
      actions: [action("pair", PAIR_LABEL, "primary")],
    };
  const hostsPending = input.hosts === null && !input.error && !input.offline;
  if (input.signedIn === null || (input.signedIn && hostsPending))
    return { ...empty, mode: "loading", actions: [] };
  if (input.deviceCodePending) return { ...empty, mode: "device-code", actions: [] };
  if (!input.signedIn) {
    const again = input.error?.kind === "auth";
    return {
      ...empty,
      mode: "signed-out",
      title: "Sign in with your Nexplore account",
      body: "Your enrolled desktops appear here, ready to open.",
      banner: errorBanner(input),
      actions: [
        action("sign-in", again ? "Sign in again" : "Sign in with Entra", "primary", {
          disabled: input.offline,
          busy: input.busy,
        }),
        pair,
      ],
    };
  }
  const refresh = (tone: "primary" | "secondary", label = "Refresh desktops") =>
    action("refresh", label, tone, { disabled: input.busy || input.offline, busy: input.busy });
  if (input.hosts === null)
    return {
      ...empty,
      mode: "load-failed",
      title: "Could not load your desktops",
      banner: errorBanner(input),
      actions: [refresh("primary", "Try again"), pair, signOut],
    };
  if (input.hosts.length === 0)
    return {
      ...empty,
      mode: "no-hosts",
      title: "No desktops yet",
      body: ENROL_STEPS,
      banner: errorBanner(input, "Could not refresh: "),
      actions: [refresh("primary"), pair, signOut],
    };
  const stale = input.error !== null && input.error.kind !== "host";
  const hosts = hostRows(input, stale || input.offline);
  const online = hosts.filter((host) => host.presence === "online").length;
  return {
    mode: "hosts",
    title: `${online} of ${hosts.length} online`,
    body:
      online === 0 && !stale && !input.offline
        ? "All your desktops are offline. Open Nexi Work on one of them, then refresh."
        : null,
    banner: errorBanner(input, "Could not refresh: ") ?? null,
    hosts,
    actions: [refresh("secondary"), pair, signOut],
  };
}
