import { describe, expect, it } from "vite-plus/test";

import { brokerListedSessions } from "./t3team-cloudSessionBrokerListed.ts";

const repoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nexi-fleet",
  workflowFileName: "session.yml",
} as const;
const nowMs = Date.parse("2026-11-10T21:10:00.000Z");
const list = (
  brokerSessions: Parameters<typeof brokerListedSessions>[0]["brokerSessions"],
  known: string[] = [],
) =>
  brokerListedSessions({
    brokerSessions,
    knownRunIds: new Set(known),
    nowMs,
    machineLabel: "Nexi cloud",
    repoRef,
  });

describe("brokerListedSessions", () => {
  it("lists a session another device started as a ready broker session", () => {
    const [session] = list([
      {
        runId: "19283746501",
        environmentId: "env-phone",
        label: "ubuntu2404",
        since: "2026-11-10T21:03:00.000Z",
      },
    ]);
    expect(session).toEqual({
      sessionId: "19283746501",
      providerKind: "github_actions",
      phase: "ready",
      elapsedSeconds: 420,
      remainingSeconds: null,
      machineLabel: "Nexi cloud",
      failureReason: null,
      detailsUrl: "https://nexplore.ghe.com/hive/nexi-fleet/actions/runs/19283746501",
      environmentId: "env-phone",
      startedAt: "2026-11-10T21:03:00.000Z",
      transport: "nexi_broker",
    });
  });

  it("never takes the VM host name as the session's name", () => {
    const [session] = list([{ runId: "1", environmentId: "env", label: "ubuntu2404" }]);
    expect(session?.name).toBeUndefined();
    expect(JSON.stringify(session)).not.toContain("ubuntu2404");
  });

  it("skips the sessions this server lists itself, and ids that are not runs", () => {
    expect(list([{ runId: "7" }, { runId: "h-host" }], ["7"])).toEqual([]);
  });
});
