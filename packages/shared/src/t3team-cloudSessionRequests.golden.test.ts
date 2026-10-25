import { describe, expect, it } from "vite-plus/test";

import { cloudSessionOwnership } from "./t3team-cloudSessionOwnership.fixtures.ts";
import { cloudSessionParse } from "./t3team-cloudSessionParse.fixtures.ts";
import { cloudSessionRequests } from "./t3team-cloudSessionRequests.fixtures.ts";
import {
  cancelRunRequest,
  type CloudSessionRepoRef,
  currentLoginRequest,
  dispatchSessionRequest,
  jobStepsRequest,
  listRunsRequest,
  repoApiPath,
  sessionTagMarker,
  type WorkflowRunSummary,
} from "./t3team-cloudSessionActionsRequests.ts";
import {
  jobsMatchAttempt,
  parseJobStepsResponse,
  parseLogin,
  parseRunsResponse,
} from "./t3team-cloudSessionActionsParse.ts";
import { actorLogin, sessionRunsForLogin } from "./t3team-cloudSessionRunOwnership.ts";

/** Golden rows come from the old apps/server/src/cloud implementation (see the fixtures headers). */
const parseRows = <T>(source: ReadonlyArray<string>): ReadonlyArray<T> =>
  source.map((row) => JSON.parse(row) as T);
/** The old rows went through JSON, so compare through it too (`undefined` fields vanish). */
const viaJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));

const FLEET: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

describe("request builders (golden)", () => {
  type Row = {
    fn: string;
    ref: CloudSessionRepoRef;
    out?: unknown;
    inputs?: Record<string, string>;
    limit?: number;
    actor?: string | null;
    actorUndefined?: boolean;
    runId?: number;
    settled?: boolean | null;
    attempt?: number | null;
    tag?: string;
    marker?: string;
  };
  const cases = parseRows<Row>(cloudSessionRequests);

  it("reproduces every request the old builders produced, for odd hosts, refs and inputs", () => {
    const fns = new Set<string>();
    for (const row of cases) {
      fns.add(row.fn);
      const label = JSON.stringify(row);
      switch (row.fn) {
        case "marker":
          expect(sessionTagMarker(row.tag!), label).toBe(row.marker);
          break;
        case "dispatch":
          expect(viaJson(dispatchSessionRequest(row.ref, row.inputs!)), label).toEqual(row.out);
          break;
        case "listRuns":
          expect(
            viaJson(
              listRunsRequest(row.ref, row.limit!, row.actorUndefined ? undefined : row.actor!),
            ),
            label,
          ).toEqual(row.out);
          break;
        case "currentLogin":
          expect(viaJson(currentLoginRequest(row.ref)), label).toEqual(row.out);
          break;
        case "jobSteps":
          expect(
            viaJson(
              jobStepsRequest(
                row.ref,
                row.runId!,
                row.settled ?? undefined,
                row.attempt ?? undefined,
              ),
            ),
            label,
          ).toEqual(row.out);
          break;
        case "cancel":
          expect(viaJson(cancelRunRequest(row.ref, row.runId!)), label).toEqual(row.out);
          break;
        case "repoApiPath":
          expect(repoApiPath(row.ref, "x/y"), label).toBe(row.out);
          break;
        default:
          throw new Error(`unknown fixture row ${row.fn}`);
      }
    }
    expect([...fns].toSorted()).toEqual(
      [
        "cancel",
        "currentLogin",
        "dispatch",
        "jobSteps",
        "listRuns",
        "marker",
        "repoApiPath",
      ].toSorted(),
    );
  });
});

describe("dispatch request (snapshot)", () => {
  const request = dispatchSessionRequest(FLEET, {
    hold_minutes: "345",
    session_tag: "api.s1x2",
    workspace: "m-pj.acme.api_",
    server_ref: "protocol-2",
    broker_grant: "grant-1",
  });

  it("POSTs to the workflow's dispatches endpoint, relative to the host's API root", () => {
    expect(request).toEqual({
      kind: "rest",
      operation: "cloudSession.dispatch",
      method: "POST",
      path: "repos/hive/nx-nexi/actions/workflows/session.yml/dispatches",
      body: {
        ref: "main",
        inputs: {
          hold_minutes: "345",
          session_tag: "api.s1x2",
          workspace: "m-pj.acme.api_",
          server_ref: "protocol-2",
          broker_grant: "grant-1",
        },
      },
    });
  });

  it("carries no headers and no credentials: the executor owns host, auth and Accept", () => {
    expect(Object.keys(request).toSorted()).toEqual([
      "body",
      "kind",
      "method",
      "operation",
      "path",
    ]);
    expect(JSON.stringify(request)).not.toMatch(/authorization|bearer|token/i);
  });

  it("serialises the inputs in the order given and never asks for run details", () => {
    // Whether GHE answers `return_run_details` is unverified (design: Gate 1), so the body must
    // stay `{ ref, inputs }` until a later change adds it on purpose.
    const body = (request as { body: { ref: string; inputs: unknown } }).body;
    expect(Object.keys(body)).toEqual(["ref", "inputs"]);
    expect(Object.keys(body.inputs as object)).toEqual([
      "hold_minutes",
      "session_tag",
      "workspace",
      "server_ref",
      "broker_grant",
    ]);
    expect(JSON.stringify(request)).not.toContain("return_run_details");
  });
});

describe("list-runs request (snapshot)", () => {
  it("asks for one page of `per_page` runs with the poll-coalescing hint and no method", () => {
    expect(listRunsRequest(FLEET, 100)).toEqual({
      kind: "rest",
      operation: "cloudSession.listRuns",
      path: "repos/hive/nx-nexi/actions/workflows/session.yml/runs?per_page=100",
      coalesce: { ttlMs: 4000 },
    });
  });

  it("has no pagination or other filters beyond the optional actor", () => {
    const path = (listRunsRequest(FLEET, 100, "pj") as { path: string }).path;
    expect(path.split("?")[1]).toBe("per_page=100&actor=pj");
    expect(path).not.toMatch(/[?&](page|status|branch|event|created|created_by)=/);
  });

  it("encodes the actor into the query, so an odd login cannot add parameters", () => {
    const path = (listRunsRequest(FLEET, 5, "a&per_page=1 b") as { path: string }).path;
    expect(path.split("?")[1]).toBe("per_page=5&actor=a%26per_page%3D1%20b");
    expect((listRunsRequest(FLEET, 5, "") as { path: string }).path).toContain("&actor=");
  });

  it("passes the limit through unvalidated, as the old builder did", () => {
    expect((listRunsRequest(FLEET, 0) as { path: string }).path).toContain("per_page=0");
    expect((listRunsRequest(FLEET, -1) as { path: string }).path).toContain("per_page=-1");
  });
});

describe("owner filter (this GHE ignores actor=)", () => {
  const run = (id: number, actor: string, name = `session [t${id}.s1]`): WorkflowRunSummary => ({
    id,
    status: "in_progress",
    conclusion: null,
    createdAt: "",
    updatedAt: "",
    htmlUrl: "",
    name,
    actor,
  });

  it("keeps only the signed-in login's runs even though the host returned everyone's", () => {
    const listed = [run(1, "pj"), run(2, "someone-else"), run(3, "pj"), run(4, "")];
    expect(sessionRunsForLogin(listed, "pj").map((item) => item.id)).toEqual([1, 3]);
  });

  it("matches the login exactly, case included (a phone must use `/user`'s own casing)", () => {
    const listed = [run(1, "PJ"), run(2, "pj")];
    expect(sessionRunsForLogin(listed, "pj").map((item) => item.id)).toEqual([2]);
    expect(sessionRunsForLogin(listed, "Pj")).toEqual([]);
    expect(sessionRunsForLogin(listed, "pj ")).toEqual([]);
  });

  it("never claims a warm standby for the actor that dispatched it", () => {
    expect(sessionRunsForLogin([run(1, "bot", "pool · standby x")], "bot")).toEqual([]);
    expect(sessionRunsForLogin([run(1, "bot", "pool · standby")], "bot")).toHaveLength(1);
  });

  it("returns what the old implementation returned over the whole ownership table", () => {
    const entries = parseRows<
      | { kind: "run"; run: WorkflowRunSummary }
      | { kind: "byLogin"; login: string; ids: number[] }
      | { kind: "actor"; value: unknown; login: string }
    >(cloudSessionOwnership);
    const runs = entries.flatMap((entry) => (entry.kind === "run" ? [entry.run] : []));
    expect(runs.length).toBeGreaterThanOrEqual(9);
    for (const entry of entries) {
      if (entry.kind === "byLogin") {
        expect(sessionRunsForLogin(runs, entry.login).map((item) => item.id)).toEqual(entry.ids);
      } else if (entry.kind === "actor") {
        const value = entry.value === "__undefined__" ? undefined : entry.value;
        expect(actorLogin(value), JSON.stringify(entry)).toBe(entry.login);
      }
    }
  });
});

describe("response parsers (golden)", () => {
  it("returns what the old parsers returned for valid, empty, hostile and malformed bodies", () => {
    for (const row of parseRows<{
      body: string;
      runs: unknown;
      login: unknown;
      steps: unknown;
    }>(cloudSessionParse)) {
      const label = JSON.stringify(row.body);
      expect(viaJson(parseRunsResponse(row.body)), label).toEqual(row.runs);
      expect(parseLogin(row.body) ?? null, label).toEqual(row.login);
      expect(viaJson(parseJobStepsResponse(row.body)), label).toEqual(row.steps);
    }
  });

  it("answers null, never an empty value, for an unreadable body", () => {
    expect(parseRunsResponse("not json")).toBeNull();
    expect(parseLogin("")).toBeNull();
    expect(parseJobStepsResponse("{}")).toBeNull();
    expect(parseRunsResponse('{"workflow_runs":[]}')).toEqual([]);
  });

  it("checks a jobs body against the run attempt it was cached for", () => {
    expect(jobsMatchAttempt('{"jobs":[{"run_attempt":2,"steps":[]}]}', 2)).toBe(true);
    expect(jobsMatchAttempt('{"jobs":[{"run_attempt":1,"steps":[]}]}', 2)).toBe(false);
  });
});
