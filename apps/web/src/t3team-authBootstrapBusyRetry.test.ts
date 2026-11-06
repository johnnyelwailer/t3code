import type { AuthSessionState } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installEnvironmentHttpTest } from "../test/environmentHttpTest";
import { __setPrimaryHttpRunnerForTests } from "./lib/runtime";

const authenticated: AuthSessionState = {
  authenticated: true,
  auth: {
    policy: "desktop-managed-local",
    bootstrapMethods: ["desktop-bootstrap"],
    sessionMethods: ["browser-session-cookie"],
    sessionCookieName: "t3_session",
  },
  sessionMethod: "browser-session-cookie",
  expiresAt: DateTime.makeUnsafe("2026-04-05T00:00:00.000Z"),
};

let dispose: (() => Promise<void>) | undefined;

describe("startup session read on a busy server", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: new URL("http://localhost/"),
      history: { state: null, replaceState: () => {} },
    });
    vi.stubGlobal("document", { title: "T3 Code" });
  });

  afterEach(async () => {
    await dispose?.();
    dispose = undefined;
    const { __resetServerAuthBootstrapForTests } = await import("./environments/primary");
    __resetServerAuthBootstrapForTests();
    __setPrimaryHttpRunnerForTests();
    vi.unstubAllGlobals();
  });

  it("keeps reading the session while the server answers 500", async () => {
    let calls = 0;
    const testApi = await installEnvironmentHttpTest({
      session: () =>
        ++calls <= 2
          ? Effect.die(new Error("event loop stalled at boot"))
          : Effect.succeed(authenticated),
    });
    dispose = testApi.dispose;
    const { resolveInitialServerAuthGateState } = await import("./environments/primary");

    await expect(resolveInitialServerAuthGateState()).resolves.toEqual({
      status: "authenticated",
    });
    expect(testApi.calls.session).toBe(3);
  });
});
