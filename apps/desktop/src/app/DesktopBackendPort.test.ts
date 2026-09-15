import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { assert, describe, it } from "@effect/vitest";

import * as NetService from "@t3tools/shared/Net";

import {
  DEFAULT_DESKTOP_BACKEND_PORT,
  DESKTOP_BACKEND_PORT_PROBE_HOSTS,
  DesktopBackendPortUnavailableError,
  DesktopPinnedBackendPortBusyError,
  resolveDesktopBackendPort,
} from "./DesktopBackendPort.ts";

const makeNetLayer = (availablePorts: ReadonlySet<number>) =>
  Layer.succeed(NetService.NetService, {
    canListenOnHost: (port: number) => Effect.succeed(availablePorts.has(port)),
    isPortAvailableOnLoopback: () => Effect.succeed(false),
    hasListenerOnHost: () => Effect.succeed(true),
    reserveLoopbackPort: () => Effect.succeed(0),
    findAvailablePort: (preferred) => Effect.succeed(preferred),
  } satisfies NetService.NetService["Service"]);

describe("resolveDesktopBackendPort", () => {
  it.effect("uses the configured port even when pinning is enabled", () =>
    resolveDesktopBackendPort(Option.some(4_123), true).pipe(
      Effect.flatMap((selection) =>
        Effect.sync(() => {
          assert.equal(selection.port, 4_123);
          assert.isFalse(selection.pinned);
          assert.isFalse(selection.selectedByScan);
        }),
      ),
      Effect.provide(makeNetLayer(new Set([DEFAULT_DESKTOP_BACKEND_PORT]))),
    ),
  );

  it.effect("pinned: keeps the default port when it is free", () =>
    resolveDesktopBackendPort(Option.none, true).pipe(
      Effect.flatMap((selection) =>
        Effect.sync(() => {
          assert.equal(selection.port, DEFAULT_DESKTOP_BACKEND_PORT);
          assert.isTrue(selection.pinned);
          assert.isFalse(selection.selectedByScan);
        }),
      ),
      Effect.provide(makeNetLayer(new Set([DEFAULT_DESKTOP_BACKEND_PORT]))),
    ),
  );

  it.effect("pinned: fails loudly when the default port is busy instead of scanning on", () =>
    resolveDesktopBackendPort(Option.none, true).pipe(
      Effect.flatMap((selection) =>
        Effect.fail(new Error(`expected the pinned port error, got port ${selection.port}`)),
      ),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          const error = Cause.squash(cause);
          assert.isTrue(error instanceof DesktopPinnedBackendPortBusyError);
          assert.equal(error.port, DEFAULT_DESKTOP_BACKEND_PORT);
          assert.deepEqual(error.hosts, [...DESKTOP_BACKEND_PORT_PROBE_HOSTS]);
          assert.match(error.message, /pinned to port 3773.*in use.*T3CODE_PORT/u);
        }),
      ),
      Effect.provide(makeNetLayer(new Set())),
    ),
  );

  it.effect("unpinned: scans upward past a busy default port", () =>
    resolveDesktopBackendPort(Option.none, false).pipe(
      Effect.flatMap((selection) =>
        Effect.sync(() => {
          assert.equal(selection.port, DEFAULT_DESKTOP_BACKEND_PORT + 1);
          assert.isTrue(selection.selectedByScan);
          assert.isFalse(selection.pinned);
        }),
      ),
      Effect.provide(makeNetLayer(new Set([DEFAULT_DESKTOP_BACKEND_PORT + 1]))),
    ),
  );

  it.effect("unpinned: reports unavailability when every port is busy", () =>
    resolveDesktopBackendPort(Option.none, false).pipe(
      Effect.flatMap((selection) =>
        Effect.fail(new Error(`expected the unavailable-port error, got port ${selection.port}`)),
      ),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          const error = Cause.squash(cause);
          assert.isTrue(error instanceof DesktopBackendPortUnavailableError);
        }),
      ),
      Effect.provide(makeNetLayer(new Set())),
    ),
  );
});
