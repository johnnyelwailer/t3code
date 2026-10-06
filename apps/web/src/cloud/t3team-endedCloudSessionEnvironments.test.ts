import {
  BearerConnectionTarget,
  BrokerConnectionTarget,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import { type CloudSession, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { endedCloudSessionEnvironments } from "./t3team-endedCloudSessionEnvironments";

const entry = (target: ConnectionCatalogEntry["target"]): ConnectionCatalogEntry => ({
  target,
  profile: Option.none(),
  enabled: true,
});
const broker = (environmentId: string, sessionId: string) =>
  [
    EnvironmentId.make(environmentId),
    entry(
      new BrokerConnectionTarget({
        environmentId: EnvironmentId.make(environmentId),
        label: "Cloud session",
        sessionId,
      }),
    ),
  ] as const;
const session = (sessionId: string, phase: CloudSession["phase"]) =>
  ({ sessionId, phase }) as CloudSession;

describe("endedCloudSessionEnvironments", () => {
  it("names the saved environments of sessions that ended, and only those", () => {
    const entries = new Map([
      broker("env-live", "s-live"),
      broker("env-stopped", "s-stopped"),
      broker("env-failed", "s-failed"),
      broker("env-gone", "s-gone"),
    ]);
    const sessions = [
      session("s-live", "ready"),
      session("s-stopped", "stopped"),
      session("s-failed", "failed"),
    ];
    expect(endedCloudSessionEnvironments(entries, sessions)).toEqual(["env-stopped", "env-failed"]);
  });

  it("never touches an environment that is not a cloud session", () => {
    const bearer = EnvironmentId.make("env-bearer");
    const entries = new Map([
      [
        bearer,
        entry(
          new BearerConnectionTarget({
            environmentId: bearer,
            label: "Laptop",
            connectionId: "laptop",
          }),
        ),
      ],
    ]);
    expect(endedCloudSessionEnvironments(entries, [session("s1", "cancelled")])).toEqual([]);
  });
});
