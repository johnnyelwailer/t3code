import { BrokerConnectionTarget, RelayConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentConnectionSummary } from "@t3tools/client-runtime/state/presentation";
import { type CloudSession, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionActions, cloudSessionRowDetail } from "./t3team-cloudSessionActions";
import { cloudSessionLaunchers } from "./t3team-cloudSessionLaunchers";

const desktop = EnvironmentId.make("env-desktop");
const laptop = EnvironmentId.make("env-laptop");
const vm = EnvironmentId.make("env-vm");

const summary = (
  environmentId: EnvironmentId,
  overrides: Partial<EnvironmentConnectionSummary> = {},
): EnvironmentConnectionSummary => ({
  environmentId,
  environmentLabel: String(environmentId),
  displayUrl: "",
  isRelayManaged: false,
  isEnabled: true,
  connectionState: "connected",
  connectionError: null,
  connectionErrorTraceId: null,
  ...overrides,
});

const catalogOf = (
  entries: ReadonlyArray<[EnvironmentId, RelayConnectionTarget | BrokerConnectionTarget]>,
) => ({ entries: new Map(entries.map(([id, target]) => [id, { target }])) });

const session = (overrides: Partial<CloudSession>): CloudSession => ({
  sessionId: "290852452",
  providerKind: "github_actions",
  phase: "queued",
  elapsedSeconds: 12,
  remainingSeconds: null,
  machineLabel: "ubuntu-slim · 12 GB · 4 cores",
  failureReason: null,
  detailsUrl: null,
  ...overrides,
});

describe("which machines start the phone's cloud sessions", () => {
  it("takes connected, switched-on machines and never a cloud session itself", () => {
    const catalog = catalogOf([
      [desktop, new RelayConnectionTarget({ environmentId: desktop, label: "Desktop" })],
      [laptop, new RelayConnectionTarget({ environmentId: laptop, label: "Laptop" })],
      [vm, new BrokerConnectionTarget({ environmentId: vm, label: "VM", sessionId: "41" })],
    ]);
    const launchers = cloudSessionLaunchers(catalog, [
      summary(desktop, { environmentLabel: "Desktop" }),
      summary(laptop, { connectionState: "reconnecting" }),
      summary(vm),
    ]);
    expect(launchers).toEqual([{ environmentId: desktop, label: "Desktop" }]);
  });

  it("skips a machine the user switched off", () => {
    const catalog = catalogOf([
      [desktop, new RelayConnectionTarget({ environmentId: desktop, label: "Desktop" })],
    ]);
    expect(cloudSessionLaunchers(catalog, [summary(desktop, { isEnabled: false })])).toEqual([]);
  });
});

describe("what a cloud session row offers", () => {
  it("cancels while provisioning, stops when ready, starts another once it ended", () => {
    expect(cloudSessionActions(session({ phase: "preparing" }))).toEqual([
      { action: "cancel", label: "Cancel", destructive: true },
    ]);
    expect(cloudSessionActions(session({ phase: "ready", environmentId: "env-a" }))).toEqual([
      { action: "cancel", label: "Stop", destructive: true },
    ]);
    expect(cloudSessionActions(session({ phase: "stopped", durationSeconds: 600 }))).toEqual([
      { action: "startAnother", label: "Start another", destructive: false },
    ]);
    expect(cloudSessionActions(session({ phase: "cancelled", machineSetup: true }))).toEqual([]);
  });

  it("opens a ready broker session on the phone once its environment is known", () => {
    const ready = session({ phase: "ready", transport: "nexi_broker" });
    expect(cloudSessionActions(ready).map((choice) => choice.action)).toEqual(["cancel"]);
    expect(
      cloudSessionActions({ ...ready, environmentId: "env-a" }).map((choice) => choice.action),
    ).toEqual(["open", "cancel"]);
    expect(
      cloudSessionActions({ ...ready, transport: "t3_connect", environmentId: "env-a" }).map(
        (choice) => choice.action,
      ),
    ).toEqual(["cancel"]);
  });

  it("reads each phase in the desktop's words", () => {
    expect(cloudSessionRowDetail(session({ phase: "queued" }))).toBe("Queued · 12s");
    expect(cloudSessionRowDetail(session({ phase: "ready", remainingSeconds: 3600 }))).toBe(
      "Ready · ubuntu-slim · 12 GB · 4 cores · 1h 0m left",
    );
  });
});
