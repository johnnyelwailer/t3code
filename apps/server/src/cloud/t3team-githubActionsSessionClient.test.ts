import { describe, expect, it } from "vite-plus/test";

import {
  cancelRunInvocation,
  type CloudSessionRepoRef,
  dispatchSessionInvocation,
  jobStepsInvocation,
  listRunsInvocation,
  parseJobStepsResponse,
  parseRunsResponse,
  RUN_FIELDS_JQ,
  sessionTagMarker,
} from "./t3team-githubActionsSessionClient.ts";
import { sessionRunsForLogin } from "./t3team-cloudSessionRunOwnership.ts";

const REF: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

describe("invocations", () => {
  it("targets the configured host, so a GHE tenant is never mistaken for github.com", () => {
    // Omitting --hostname is the exact failure that produced "HTTP 401: Bad
    // credentials" against this tenant: gh silently used its default host.
    for (const invocation of [
      dispatchSessionInvocation(REF, {}),
      listRunsInvocation(REF, 20),
      jobStepsInvocation(REF, 1),
      cancelRunInvocation(REF, 1),
    ]) {
      const hostIndex = invocation.args.indexOf("--hostname");
      expect(hostIndex).toBeGreaterThanOrEqual(0);
      expect(invocation.args[hostIndex + 1]).toBe("nexplore.ghe.com");
    }
  });

  it("dispatches by POSTing the ref, hold_minutes, and session_tag on stdin", () => {
    // `session_tag` is the only way to find our own run: workflow_dispatch
    // answers 204 and never reveals the run id it created, so the tag must
    // ride along with the dispatch or the session is unfindable forever.
    const invocation = dispatchSessionInvocation(REF, {
      hold_minutes: "240",
      session_tag: "c9f4a2",
    });
    expect(invocation.args).toEqual([
      "api",
      "--hostname",
      "nexplore.ghe.com",
      "repos/hive/nx-nexi/actions/workflows/session.yml/dispatches",
      "--method",
      "POST",
      "--input",
      "-",
    ]);
    expect(JSON.parse(invocation.stdin ?? "")).toEqual({
      ref: "main",
      inputs: { hold_minutes: "240", session_tag: "c9f4a2" },
    });
  });

  it("reads runs for the session workflow only, bounded by the limit", () => {
    expect(listRunsInvocation(REF, 20).args.at(-1)).toBe(
      "repos/hive/nx-nexi/actions/workflows/session.yml/runs?per_page=20",
    );
  });

  it("asks gh for only the run fields it reads, so a full page stays far under the output cap", () => {
    const args = listRunsInvocation(REF, 100, "pj").args;
    expect(args[args.indexOf("--jq") + 1]).toBe(RUN_FIELDS_JQ);
    for (const field of [
      "id",
      "status",
      "conclusion",
      "created_at",
      "updated_at",
      "html_url",
      "name",
      "display_title",
    ]) {
      expect(RUN_FIELDS_JQ).toMatch(new RegExp(`[{ ,]${field}[,}]`));
    }
    // The owner filter needs who started each run.
    expect(RUN_FIELDS_JQ).toContain("actor: {login: .actor.login}");
    // The projection keeps the shape the parser reads.
    const projected = {
      workflow_runs: [
        {
          id: 7,
          status: "in_progress",
          conclusion: null,
          created_at: "2026-10-08T10:00:30Z",
          updated_at: "2026-10-08T10:00:33Z",
          html_url: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/7",
          name: "nexi-session [abc] · broker",
          display_title: "nexi-session [abc] · broker",
          actor: { login: "pj" },
        },
      ],
    };
    expect(parseRunsResponse(JSON.stringify(projected))).toEqual([
      {
        id: 7,
        status: "in_progress",
        conclusion: null,
        createdAt: "2026-10-08T10:00:30Z",
        updatedAt: "2026-10-08T10:00:33Z",
        htmlUrl: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/7",
        name: "nexi-session [abc] · broker",
        actor: "pj",
      },
    ]);
  });

  it("cancels a run by id with POST and no body", () => {
    const invocation = cancelRunInvocation(REF, 248523362);
    expect(invocation.args).toContain("repos/hive/nx-nexi/actions/runs/248523362/cancel");
    expect(invocation.args).toContain("POST");
    expect(invocation.stdin).toBeUndefined();
  });
});

describe("parseRunsResponse", () => {
  it("maps the API's snake_case onto the run summary", () => {
    const runs = parseRunsResponse(
      JSON.stringify({
        workflow_runs: [
          {
            id: 248523362,
            status: "completed",
            conclusion: "success",
            created_at: "2026-09-12T21:28:18Z",
            updated_at: "2026-09-12T21:35:59Z",
            html_url: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/248523362",
            name: "hive/nx-nexi [main] [c9f4a2]",
            actor: { login: "pj" },
          },
        ],
      }),
    );
    expect(runs).toEqual([
      {
        id: 248523362,
        status: "completed",
        conclusion: "success",
        createdAt: "2026-09-12T21:28:18Z",
        updatedAt: "2026-09-12T21:35:59Z",
        htmlUrl: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/248523362",
        name: "hive/nx-nexi [main] [c9f4a2]",
        actor: "pj",
      },
    ]);
  });

  it("falls back to display_title when a run carries no name", () => {
    // The correlation tag lives in the run name; when the API only offers
    // display_title it must still be surfaced, or tagged matching fails.
    const runs = parseRunsResponse(
      JSON.stringify({
        workflow_runs: [{ id: 1, status: "in_progress", display_title: "hive/nx-nexi [c9f4a2]" }],
      }),
    );
    expect(runs?.[0]?.name).toBe("hive/nx-nexi [c9f4a2]");
  });

  it("reads a null conclusion as null rather than a string", () => {
    const runs = parseRunsResponse(
      JSON.stringify({ workflow_runs: [{ id: 1, status: "in_progress", conclusion: null }] }),
    );
    expect(runs?.[0]?.conclusion).toBeNull();
  });

  it("composes the tag marker so a run carrying the tag matches by name", () => {
    // dispatch sends session_tag; run-name echoes it as "[tag]"; the client
    // locates its own run via name.includes(marker).
    const tag = "c9f4a2";
    const runs = parseRunsResponse(
      JSON.stringify({
        workflow_runs: [{ id: 7, status: "in_progress", name: "hive/nx-nexi [main] [c9f4a2]" }],
      }),
    );
    expect(runs?.[0]?.name.includes(sessionTagMarker(tag))).toBe(true);
  });

  it("treats an empty workflow_runs list as authoritative: no sessions", () => {
    // [] is a real, parseable answer: "nothing is running". It must stay
    // distinguishable from "we could not read this".
    expect(parseRunsResponse(JSON.stringify({ workflow_runs: [] }))).toEqual([]);
  });

  it.each([
    ["malformed JSON", "not json at all"],
    ["an object with no workflow_runs key", JSON.stringify({})],
    ["a workflow_runs that is not an array", JSON.stringify({ workflow_runs: "nope" })],
  ])(
    "returns null (not []) when the response is unreadable: %s",
    (_label: string, stdout: string) => {
      // A truncated or error response must read as "unknown", never as
      // "nothing is running": collapsing null into [] hid live sessions and let
      // a stale run be mistaken for a new one.
      expect(parseRunsResponse(stdout)).toBeNull();
    },
  );
});

describe("sessionRunsForLogin", () => {
  const run = (actor: string, name: string) =>
    ({
      id: 1,
      status: "in_progress",
      conclusion: null,
      createdAt: "",
      updatedAt: "",
      htmlUrl: "",
      name,
      actor,
    }) as const;

  it("keeps only this login's runs, and never a warm standby", () => {
    // GHE ignores actor= on the runs query (verified: actor=pj still returns
    // github-actions[bot] standbys), so the filter is applied here.
    const kept = sessionRunsForLogin(
      [
        run("pj", "nexi-session [mine]"),
        run("github-actions[bot]", "nexi-session · broker · machine · standby pj.nexi-machine-qa"),
        run("someone-else", "nexi-session [theirs]"),
        run("pj", "nexi-session · broker · machine · standby pj.nexi-machine-qa"),
      ],
      "pj",
    );
    expect(kept.map((entry) => entry.name)).toEqual(["nexi-session [mine]"]);
  });
});

describe("parseJobStepsResponse", () => {
  it("flattens steps across jobs, preserving order", () => {
    // Order is what phase derivation reads, so it has to survive flattening.
    const steps = parseJobStepsResponse(
      JSON.stringify({
        jobs: [
          {
            steps: [
              { name: "Set up job", status: "completed", conclusion: "success" },
              { name: "Checkout the t3code fork", status: "in_progress", conclusion: null },
            ],
          },
          { steps: [{ name: "Complete job", status: "queued", conclusion: null }] },
        ],
      }),
    );
    expect(steps?.map((step) => step.name)).toEqual([
      "Set up job",
      "Checkout the t3code fork",
      "Complete job",
    ]);
    expect(steps?.[1]).toEqual({
      name: "Checkout the t3code fork",
      status: "in_progress",
      conclusion: null,
    });
  });

  it("returns [] when jobs parsed but carried no steps", () => {
    // A valid response whose jobs have no steps is a real answer ("nothing
    // has started"), so phase derivation may lawfully read it as requested.
    expect(parseJobStepsResponse(JSON.stringify({ jobs: [{}] }))).toEqual([]);
  });

  it.each([
    ["malformed JSON", "<html>gateway error</html>"],
    ["an object with no jobs key", JSON.stringify({})],
    ["a jobs list that is not an array", JSON.stringify({ jobs: "nope" })],
  ])(
    "returns null (not []) when the response is unreadable: %s",
    (_label: string, stdout: string) => {
      // Treating an unreadable jobs response as "no steps" dragged a running
      // session's phase backwards to requested on one flaky poll.
      expect(parseJobStepsResponse(stdout)).toBeNull();
    },
  );
});
