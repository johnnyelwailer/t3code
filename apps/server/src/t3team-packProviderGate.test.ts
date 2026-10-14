import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { resolveProjectProviderInstanceEnabledWithPack } from "./t3team-packProviderGate.ts";

const projectId = ProjectId.make("project-a");
const nexplore = ProviderInstanceId.make("nexplore");
const deleted = ProviderInstanceId.make("codex_work");

const overlay = { [nexplore]: { driver: ProviderDriverKind.make("nexplore"), enabled: true } };
const settings = { ...DEFAULT_SERVER_SETTINGS, providerInstances: {} };

describe("resolveProjectProviderInstanceEnabledWithPack", () => {
  it("starts an instance the pack registers even though settings have no entry for it", () => {
    expect(
      resolveProjectProviderInstanceEnabledWithPack(settings, projectId, nexplore, overlay),
    ).toBe(true);
  });

  it("keeps an unknown, unregistered instance disabled", () => {
    expect(
      resolveProjectProviderInstanceEnabledWithPack(settings, projectId, deleted, overlay),
    ).toBe(false);
  });

  it("lets the user's own settings entry win over the pack overlay", () => {
    const disabled = {
      ...settings,
      providerInstances: {
        [nexplore]: { driver: ProviderDriverKind.make("nexplore"), enabled: false },
      },
    };
    expect(
      resolveProjectProviderInstanceEnabledWithPack(disabled, projectId, nexplore, overlay),
    ).toBe(false);
  });
});
