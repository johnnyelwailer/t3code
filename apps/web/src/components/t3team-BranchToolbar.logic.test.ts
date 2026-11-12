import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { dedupeRunOnEnvironments } from "./BranchToolbar.logic";

const runOnEnvironment = (overrides: {
  environmentId?: string;
  label?: string;
  isPrimary?: boolean;
  machine?: "server" | "cloud" | "desktop" | "laptop" | "mac-mini" | "mac-studio";
}) => ({
  environmentId: EnvironmentId.make(overrides.environmentId ?? "environment-x"),
  projectId: ProjectId.make("project-x"),
  label: overrides.label ?? "Some machine",
  isPrimary: overrides.isPrimary ?? false,
  machine: overrides.machine ?? "server",
});

describe("dedupeRunOnEnvironments", () => {
  it("keeps distinct machines untouched", () => {
    const first = runOnEnvironment({ environmentId: "env-a", label: "MacBook Pro" });
    const second = runOnEnvironment({ environmentId: "env-b", label: "Studio" });
    expect(dedupeRunOnEnvironments([first, second], first.environmentId)).toHaveLength(2);
  });

  it("collapses the same machine minted under two relay ids", () => {
    const first = runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" });
    const duplicate = runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" });
    const deduped = dedupeRunOnEnvironments([first, duplicate], first.environmentId);
    expect(deduped).toEqual([first]);
  });

  it("matches labels case-insensitively and ignores surrounding whitespace", () => {
    const first = runOnEnvironment({ environmentId: "env-a", label: "  NX-NEXI " });
    const duplicate = runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" });
    expect(dedupeRunOnEnvironments([first, duplicate], first.environmentId)).toHaveLength(1);
  });

  it("never collapses two different machine kinds with the same label", () => {
    const first = runOnEnvironment({
      environmentId: "env-a",
      label: "MacBook Pro",
      machine: "laptop",
    });
    const second = runOnEnvironment({
      environmentId: "env-b",
      label: "MacBook Pro",
      machine: "server",
    });
    expect(dedupeRunOnEnvironments([first, second], first.environmentId)).toHaveLength(2);
  });

  it("keeps the active environment even when its duplicate was seen first", () => {
    const first = runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" });
    const active = runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" });
    const deduped = dedupeRunOnEnvironments([first, active], active.environmentId);
    expect(deduped).toEqual([active]);
  });

  it("never touches the primary row", () => {
    const primary = runOnEnvironment({
      environmentId: "env-primary",
      label: "This device",
      isPrimary: true,
    });
    const remote = runOnEnvironment({ environmentId: "env-a", label: "This device" });
    expect(dedupeRunOnEnvironments([primary, remote], primary.environmentId)).toHaveLength(2);
  });

  it("keeps the connected row when the stale duplicate was seen first", () => {
    const stale = runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" });
    const live = {
      ...runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" }),
      connected: true,
    };
    const deduped = dedupeRunOnEnvironments([stale, live], stale.environmentId);
    expect(deduped).toEqual([live]);
  });

  it("keeps the connected row when it was seen first", () => {
    const live = {
      ...runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" }),
      connected: true,
    };
    const stale = runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" });
    const deduped = dedupeRunOnEnvironments([live, stale], live.environmentId);
    expect(deduped).toEqual([live]);
  });

  it("still prefers the active environment over a connected duplicate", () => {
    const stale = {
      ...runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" }),
      connected: true,
    };
    const active = runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" });
    const deduped = dedupeRunOnEnvironments([stale, active], active.environmentId);
    expect(deduped).toEqual([active]);
  });

  it("keeps the first row when both duplicates are connected", () => {
    const first = {
      ...runOnEnvironment({ environmentId: "env-a", label: "nx-nexi" }),
      connected: true,
    };
    const second = {
      ...runOnEnvironment({ environmentId: "env-b", label: "nx-nexi" }),
      connected: true,
    };
    const deduped = dedupeRunOnEnvironments([first, second], first.environmentId);
    expect(deduped).toEqual([first]);
  });
});
