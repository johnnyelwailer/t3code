import { ProjectId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { hostProviderDrivers, hostProviderInstances } from "./t3team-hostProviderInstances.ts";
import { resolveProjectProviderInstanceEnabledWithPack } from "./t3team-packProviderGate.ts";

const on = (key: string) => (key === "NEXI_FF_DELEGATE_CLOUD" ? "1" : undefined);
const off = (key: string) => (key === "NEXI_FF_DELEGATE_CLOUD" ? "0" : undefined);
const remote = ProviderInstanceId.make("remoteEnvironment");

describe("host provider instances", () => {
  it("contributes nothing with the flag off", () => {
    expect(hostProviderDrivers(off)).toEqual([]);
    expect(hostProviderInstances(off)).toEqual({});
  });

  it("contributes the remote environment driver and its enabled instance with the flag on", () => {
    expect(hostProviderDrivers(on).map((driver) => driver.driverKind)).toEqual([
      "remoteEnvironment",
    ]);
    expect(hostProviderInstances(on)).toEqual({
      remoteEnvironment: { driver: "remoteEnvironment", enabled: true },
    });
  });
});

describe("dispatch gate", () => {
  const settings = { providerInstances: {}, projectSettingsOverrides: {} };
  const project = ProjectId.make("p");

  it("admits the host's instance only while the flag is on, and a settings entry wins", () => {
    expect(
      resolveProjectProviderInstanceEnabledWithPack(
        settings,
        project,
        remote,
        {},
        hostProviderInstances(on),
      ),
    ).toBe(true);
    expect(
      resolveProjectProviderInstanceEnabledWithPack(
        {
          ...settings,
          providerInstances: {
            [remote]: { driver: ProviderDriverKind.make("remoteEnvironment"), enabled: false },
          },
        },
        project,
        remote,
        {},
        hostProviderInstances(on),
      ),
    ).toBe(false);
    expect(
      resolveProjectProviderInstanceEnabledWithPack(
        settings,
        project,
        remote,
        {},
        hostProviderInstances(off),
      ),
    ).toBe(false);
  });
});
