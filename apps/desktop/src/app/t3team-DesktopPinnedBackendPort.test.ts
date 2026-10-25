import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { assert, describe, it } from "@effect/vitest";

import * as NetService from "@t3tools/shared/Net";

import {
  DEFAULT_DESKTOP_BACKEND_PORT,
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

const isPinnedPortBusy = Schema.is(DesktopPinnedBackendPortBusyError);

describe("resolveDesktopBackendPort with a pinned port number", () => {
  it.effect("keeps the pinned port, not the default, when it is free", () =>
    resolveDesktopBackendPort(Option.none(), 3_774).pipe(
      Effect.flatMap((selection) =>
        Effect.sync(() => {
          assert.equal(selection.port, 3_774);
          assert.isTrue(selection.pinned);
          assert.isFalse(selection.selectedByScan);
        }),
      ),
      Effect.provide(makeNetLayer(new Set([3_774]))),
    ),
  );

  it.effect("names the pinned port when it is busy even though the default is free", () =>
    resolveDesktopBackendPort(Option.none(), 3_774).pipe(
      Effect.flip,
      Effect.flatMap((error) =>
        Effect.sync(() => {
          assert.isTrue(isPinnedPortBusy(error));
          if (!isPinnedPortBusy(error)) return;
          assert.equal(error.port, 3_774);
          assert.match(error.message, /pinned to port 3774.*in use/u);
        }),
      ),
      Effect.provide(makeNetLayer(new Set([DEFAULT_DESKTOP_BACKEND_PORT]))),
    ),
  );
});
