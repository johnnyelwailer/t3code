import { ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionDelays } from "./t3team-cloudSessionDelays.fixtures.ts";
import { cloudSessionDispatch } from "./t3team-cloudSessionDispatch.fixtures.ts";
import { cloudSessionPlain } from "./t3team-cloudSessionPlain.fixtures.ts";
import {
  dispatchSessionRequest,
  type CloudSessionRepoRef,
  type WorkflowRunSummary,
} from "./t3team-cloudSessionActionsRequests.ts";
import {
  discoveryDelayMs,
  findTaggedRun,
  sessionDispatchInputs,
  sessionServerRef,
  type SessionDispatchOptions,
} from "./t3team-cloudSessionDispatchPlan.ts";
import {
  type CloudSessionPlainProject,
  plainProjectDispatchInputs,
} from "./t3team-cloudSessionPlainProject.ts";

const REF: CloudSessionRepoRef = {
  host: "h.example",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};
const BASE = { sessionTag: "api.s1x2", workspace: "u-pj_", durationSeconds: 3600 } as const;

describe("dispatch inputs (golden)", () => {
  it("builds the same requests the old inline code sent, for every option combination", () => {
    expect(cloudSessionDispatch.length).toBeGreaterThanOrEqual(25);
    for (const text of cloudSessionDispatch) {
      const row = JSON.parse(text) as {
        extra: Partial<SessionDispatchOptions>;
        requests: unknown[];
      };
      const request = dispatchSessionRequest(REF, sessionDispatchInputs({ ...BASE, ...row.extra }));
      // The fixtures were captured at protocol 2; the ref follows the contract's version.
      const expected = JSON.parse(
        text.replace("protocol-2", `protocol-${ORCHESTRATION_PROTOCOL_VERSION}`),
      ) as {
        requests: unknown[];
      };
      expect(JSON.parse(JSON.stringify(request)), text).toEqual(expected.requests[0]);
    }
  });

  it("orders the inputs as the workflow has always received them", () => {
    const inputs = sessionDispatchInputs({
      ...BASE,
      brokerGrant: "g",
      machine: {
        repository: { url: "https://h/o/n.git" },
        commit: "abc",
        devcontainerPath: "d.json",
        healthCheck: "npm test",
        teamSecretNames: ["A", "B"],
      },
    });
    expect(Object.keys(inputs)).toEqual([
      "hold_minutes",
      "session_tag",
      "workspace",
      "server_ref",
      "broker_grant",
      "machine_repository",
      "machine_commit",
      "machine_devcontainer",
      "machine_health_check",
      "machine_team_secrets",
    ]);
    expect(inputs["machine_team_secrets"]).toBe("A,B");
    expect(inputs["server_ref"]).toBe(sessionServerRef);
  });

  it("rounds the hold to whole minutes with a floor of one", () => {
    const hold = (durationSeconds: number) =>
      sessionDispatchInputs({ ...BASE, durationSeconds })["hold_minutes"];
    expect([0, 1, 29, 30, 89, 90, 20700, 0.4, -5].map(hold)).toEqual([
      "1",
      "1",
      "1",
      "1",
      "1",
      "2",
      "345",
      "1",
      "1",
    ]);
  });

  it("omits an empty grant, an unset health check and no team secrets", () => {
    const inputs = sessionDispatchInputs({
      ...BASE,
      brokerGrant: "",
      machine: {
        repository: { url: "u" },
        commit: "c",
        devcontainerPath: "d",
        healthCheck: "",
        teamSecretNames: [],
      },
    });
    expect(Object.keys(inputs)).not.toContain("broker_grant");
    expect(Object.keys(inputs)).not.toContain("machine_health_check");
    expect(Object.keys(inputs)).not.toContain("machine_team_secrets");
  });

  it("lets a machine setup's repository win over a machine's, as the old spread order did", () => {
    const inputs = sessionDispatchInputs({
      ...BASE,
      machine: {
        repository: { url: "m" },
        commit: "mc",
        devcontainerPath: "d",
        healthCheck: null,
        teamSecretNames: [],
      },
      setup: { repository: { url: "s" }, commit: "sc" },
    });
    expect(inputs["machine_repository"]).toBe("s");
    expect(inputs["machine_commit"]).toBe("sc");
    expect(inputs["machine_setup"]).toBe("true");
  });
});

describe("plain project inputs (golden)", () => {
  it("matches the old implementation for checkout, workspace, null and undefined", () => {
    for (const text of cloudSessionPlain) {
      const row = JSON.parse(text) as {
        project: CloudSessionPlainProject | null;
        undefinedProject: boolean;
        inputs: Record<string, string>;
      };
      expect(
        plainProjectDispatchInputs(row.undefinedProject ? undefined : row.project),
        text,
      ).toEqual(row.inputs);
    }
  });
});

describe("discovery schedule (golden)", () => {
  it("backs off 1s, 1.6s, ... capped at 8s exactly as before", () => {
    for (const text of cloudSessionDelays) {
      const row = JSON.parse(text) as { attempt: number; ms: number };
      expect(discoveryDelayMs(row.attempt), text).toBe(row.ms);
    }
    expect([0, 1, 2, 3, 4, 5, 6].map(discoveryDelayMs)).toEqual([
      1000, 1600, 2560, 4096, 6554, 8000, 8000,
    ]);
  });
});

describe("finding our own run", () => {
  const run = (id: number, name: string): WorkflowRunSummary => ({
    id,
    status: "queued",
    conclusion: null,
    createdAt: "",
    updatedAt: "",
    htmlUrl: "",
    name,
    actor: "pj",
  });

  it("matches the bracketed tag anywhere in the run name, and only that dispatch's tag", () => {
    const runs = [
      run(1, "session [other.s1]"),
      run(2, "x [api.s1x2] · broker"),
      run(3, "[api.s1x2]"),
    ];
    expect(findTaggedRun(runs, "api.s1x2")?.id).toBe(2);
    expect(findTaggedRun(runs, "other.s1")?.id).toBe(1);
    expect(findTaggedRun(runs, "api.s1")).toBeUndefined();
    expect(findTaggedRun([], "api.s1x2")).toBeUndefined();
  });

  it("does not adopt a run whose name only contains the tag without its brackets", () => {
    expect(findTaggedRun([run(1, "api.s1x2")], "api.s1x2")).toBeUndefined();
  });
});
