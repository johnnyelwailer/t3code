import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentThreadShell } from "./models.ts";
import { hasLiveSubagentChild, supportsT3TeamStopCascade } from "./t3team-threadStopCascade.ts";

const ENV = EnvironmentId.make("env-1");
const PARENT = ThreadId.make("parent");

type ShellFields = Pick<
  EnvironmentThreadShell,
  "environmentId" | "lineage" | "runtime" | "pendingBackgroundTasks"
>;

function child(overrides: {
  readonly parent?: ThreadId | null;
  readonly relationship?: "subagent" | "fork" | null;
  readonly runtimeStatus?: "running" | "idle" | null;
  readonly background?: number;
  readonly environmentId?: EnvironmentId;
}): ShellFields {
  const parent = overrides.parent === undefined ? PARENT : overrides.parent;
  return {
    environmentId: overrides.environmentId ?? ENV,
    lineage: {
      rootThreadId: parent ?? ThreadId.make("child"),
      parentThreadId: parent,
      relationshipToParent:
        overrides.relationship === undefined ? "subagent" : overrides.relationship,
    },
    runtime:
      overrides.runtimeStatus === null || overrides.runtimeStatus === undefined
        ? null
        : ({
            status: overrides.runtimeStatus,
            activeRunId: overrides.runtimeStatus === "running" ? "run-1" : null,
          } as unknown as EnvironmentThreadShell["runtime"]),
    pendingBackgroundTasks: Array.from(
      { length: overrides.background ?? 0 },
      () => ({}) as EnvironmentThreadShell["pendingBackgroundTasks"][number],
    ),
  };
}

const parent = { environmentId: ENV, threadId: PARENT };

describe("hasLiveSubagentChild", () => {
  it("finds a running subagent child or one still waiting on its own background work", () => {
    expect(hasLiveSubagentChild([child({ runtimeStatus: "running" })], parent)).toBe(true);
    expect(hasLiveSubagentChild([child({ runtimeStatus: "idle", background: 1 })], parent)).toBe(
      true,
    );
  });

  it("ignores idle children, forks, other parents and other environments", () => {
    expect(hasLiveSubagentChild([child({ runtimeStatus: "idle" })], parent)).toBe(false);
    expect(
      hasLiveSubagentChild([child({ relationship: "fork", runtimeStatus: "running" })], parent),
    ).toBe(false);
    expect(
      hasLiveSubagentChild(
        [child({ parent: ThreadId.make("other"), runtimeStatus: "running" })],
        parent,
      ),
    ).toBe(false);
    expect(
      hasLiveSubagentChild(
        [child({ environmentId: EnvironmentId.make("env-2"), runtimeStatus: "running" })],
        parent,
      ),
    ).toBe(false);
  });
});

describe("supportsT3TeamStopCascade", () => {
  it("is off unless the server advertises it", () => {
    expect(supportsT3TeamStopCascade(undefined)).toBe(false);
    expect(supportsT3TeamStopCascade({})).toBe(false);
    expect(supportsT3TeamStopCascade({ stopCascade: true })).toBe(true);
  });
});
