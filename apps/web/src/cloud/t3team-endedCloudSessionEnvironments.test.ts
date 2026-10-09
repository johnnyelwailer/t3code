import {
  BearerConnectionTarget,
  BrokerConnectionTarget,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import { type CloudSession, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { endedCloudSessionEnvironmentIds } from "./t3team-endedCloudSessionEnvironments";

const saved = (environmentId: string, target: ConnectionCatalogEntry["target"]) => ({
  environmentId: EnvironmentId.make(environmentId),
  entry: { target },
});
const broker = (environmentId: string, sessionId: string) =>
  saved(
    environmentId,
    new BrokerConnectionTarget({
      environmentId: EnvironmentId.make(environmentId),
      label: "Cloud session",
      sessionId,
    }),
  );
const session = (sessionId: string, phase: CloudSession["phase"]) =>
  ({ sessionId, phase }) as CloudSession;

describe("endedCloudSessionEnvironmentIds", () => {
  it("names the saved environments of sessions that ended, and only those", () => {
    const environments = [
      broker("env-live", "s-live"),
      broker("env-stopped", "s-stopped"),
      broker("env-failed", "s-failed"),
      broker("env-gone", "s-gone"),
    ];
    const sessions = [
      session("s-live", "ready"),
      session("s-stopped", "stopped"),
      session("s-failed", "failed"),
    ];
    expect([...endedCloudSessionEnvironmentIds(environments, sessions)]).toEqual([
      "env-stopped",
      "env-failed",
    ]);
  });

  it("does not call an environment ended while the workspace's next session serves it", () => {
    const environments = [broker("env-ws", "s-first")];
    const sessions = [
      session("s-first", "stopped"),
      { ...session("s-next", "ready"), environmentId: "env-ws" } as CloudSession,
    ];
    expect(endedCloudSessionEnvironmentIds(environments, sessions).size).toBe(0);
  });

  it("never marks an environment that is not a cloud session", () => {
    const laptop = saved(
      "env-laptop",
      new BearerConnectionTarget({
        environmentId: EnvironmentId.make("env-laptop"),
        label: "Laptop",
        connectionId: "s1",
      }),
    );
    expect(endedCloudSessionEnvironmentIds([laptop], [session("s1", "cancelled")]).size).toBe(0);
  });
});
