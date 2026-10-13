import { ProjectId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setPackProviderOverlay } from "../t3team-pack-providerOverlay.ts";
import { resolveProjectProviderInstanceEnabledPackAware } from "./t3team-packAwareProviderEnablement.ts";

const projectId = ProjectId.make("project:pack-enablement");
const packInstance = ProviderInstanceId.make("nexplore");
const noOverrides = { providerInstances: {}, projectSettingsOverrides: {} };

describe("resolveProjectProviderInstanceEnabledPackAware", () => {
  afterEach(() =>
    setPackProviderOverlay({ configMap: {} as never, driverDefinitions: new Map() }),
  );

  it("treats an unconfigured instance as disabled unless a pack registered it", () => {
    expect(
      resolveProjectProviderInstanceEnabledPackAware(noOverrides, projectId, packInstance),
    ).toBe(false);
    setPackProviderOverlay({
      configMap: {
        [packInstance]: { driver: ProviderDriverKind.make("nexplore") },
      } as never,
      driverDefinitions: new Map(),
    });
    expect(
      resolveProjectProviderInstanceEnabledPackAware(noOverrides, projectId, packInstance),
    ).toBe(true);
  });

  it("lets a project turn a pack provider off", () => {
    setPackProviderOverlay({
      configMap: { [packInstance]: { driver: ProviderDriverKind.make("nexplore") } } as never,
      driverDefinitions: new Map(),
    });
    const settings = {
      providerInstances: {},
      projectSettingsOverrides: {
        [projectId]: { providerInstances: { [packInstance]: { enabled: false } } },
      },
    } as never;
    expect(resolveProjectProviderInstanceEnabledPackAware(settings, projectId, packInstance)).toBe(
      false,
    );
  });
});
