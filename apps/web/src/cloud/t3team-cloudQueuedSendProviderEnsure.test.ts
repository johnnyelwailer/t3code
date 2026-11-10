import { describe, expect, it } from "vite-plus/test";

import { ensureActionForProviderGate } from "./t3team-cloudQueuedSendProviderEnsure";

describe("ensureActionForProviderGate", () => {
  it("installs when the CLI is missing, connects when only auth is missing", () => {
    expect(ensureActionForProviderGate({ kind: "needsInstall", tool: "claude" })).toBe("install");
    expect(ensureActionForProviderGate({ kind: "needsAuth", tool: "claude" })).toBe("connect");
    expect(ensureActionForProviderGate({ kind: "ready" })).toBeNull();
    expect(ensureActionForProviderGate({ kind: "wait" })).toBeNull();
    expect(ensureActionForProviderGate({ kind: "failed", message: "x" })).toBeNull();
  });
});
