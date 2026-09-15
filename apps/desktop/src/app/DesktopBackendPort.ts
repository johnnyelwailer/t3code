/**
 * Desktop backend port selection.
 *
 * Development always requires an explicit `T3CODE_PORT` (many dev worktrees run side by side).
 * Production normally scans upward from the default port. A pinned production build (the released
 * app) must NOT scan: the OAuth callback, relay configuration and anything else that addresses the
 * backend by port rely on the default port being the port the app actually listens on. A pinned
 * build therefore fails loudly when the default port is busy instead of silently moving.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as NetService from "@t3tools/shared/Net";

export const DEFAULT_DESKTOP_BACKEND_PORT = 3773;
export const MAX_TCP_PORT = 65_535;
export const DESKTOP_BACKEND_PORT_PROBE_HOSTS = ["127.0.0.1", "0.0.0.0", "::"] as const;

export class DesktopBackendPortUnavailableError extends Schema.TaggedErrorClass<DesktopBackendPortUnavailableError>()(
  "DesktopBackendPortUnavailableError",
  {
    startPort: Schema.Int,
    maxPort: Schema.Int,
    hosts: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `No desktop backend port is available on hosts ${this.hosts.join(", ")} between ${this.startPort} and ${this.maxPort}.`;
  }
}

export class DesktopPinnedBackendPortBusyError extends Schema.TaggedErrorClass<DesktopPinnedBackendPortBusyError>()(
  "DesktopPinnedBackendPortBusyError",
  {
    port: Schema.Int,
    hosts: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `The desktop backend is pinned to port ${this.port}, but it is already in use on ${this.hosts.join(", ")}. Quit the app holding that port, or set T3CODE_PORT to run on another port.`;
  }
}

export type DesktopBackendPortSelection = {
  readonly port: number;
  readonly selectedByScan: boolean;
  readonly pinned: boolean;
};

export const resolveDesktopBackendPort = Effect.fn("resolveDesktopBackendPort")(function* (
  configuredPort: Option.Option<number>,
  pinDefaultPort: boolean,
): Effect.Effect<DesktopBackendPortSelection> {
  if (Option.isSome(configuredPort)) {
    return {
      port: configuredPort.value,
      selectedByScan: false,
      pinned: false,
    } as const;
  }

  const net = yield* NetService.NetService;
  if (pinDefaultPort) {
    let availableOnEveryHost = true;
    for (const host of DESKTOP_BACKEND_PORT_PROBE_HOSTS) {
      if (!(yield* net.canListenOnHost(DEFAULT_DESKTOP_BACKEND_PORT, host))) {
        availableOnEveryHost = false;
        break;
      }
    }
    if (availableOnEveryHost) {
      return {
        port: DEFAULT_DESKTOP_BACKEND_PORT,
        selectedByScan: false,
        pinned: true,
      } as const;
    }
    return yield* new DesktopPinnedBackendPortBusyError({
      port: DEFAULT_DESKTOP_BACKEND_PORT,
      hosts: DESKTOP_BACKEND_PORT_PROBE_HOSTS,
    });
  }

  for (let port = DEFAULT_DESKTOP_BACKEND_PORT; port <= MAX_TCP_PORT; port += 1) {
    let availableOnEveryHost = true;

    for (const host of DESKTOP_BACKEND_PORT_PROBE_HOSTS) {
      if (!(yield* net.canListenOnHost(port, host))) {
        availableOnEveryHost = false;
        break;
      }
    }

    if (availableOnEveryHost) {
      return {
        port,
        selectedByScan: true,
        pinned: false,
      } as const;
    }
  }

  return yield* new DesktopBackendPortUnavailableError({
    startPort: DEFAULT_DESKTOP_BACKEND_PORT,
    maxPort: MAX_TCP_PORT,
    hosts: DESKTOP_BACKEND_PORT_PROBE_HOSTS,
  });
});
