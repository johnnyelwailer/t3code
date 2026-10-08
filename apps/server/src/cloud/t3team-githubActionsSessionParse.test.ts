import { describe, expect, it } from "vite-plus/test";

import { sessionTagMarker } from "./t3team-githubActionsSessionClient.ts";
import {
  parseJobStepsResponse,
  parseLogin,
  parseRunsResponse,
} from "./t3team-githubActionsSessionParse.ts";

describe("parseLogin", () => {
  it("reads the login out of GET /user", () => {
    expect(parseLogin(JSON.stringify({ login: "pj" }))).toBe("pj");
  });

  it.each([
    ["malformed JSON", "<html>gateway error</html>"],
    ["an object with no login", JSON.stringify({})],
    ["a blank login", JSON.stringify({ login: "   " })],
  ])("fails closed on %s", (_label: string, body: string) => {
    // A blank identity must never read as "signed in": the list is scoped to it.
    expect(parseLogin(body)).toBeNull();
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
    (_label: string, body: string) => {
      // A truncated or error response must read as "unknown", never as
      // "nothing is running": collapsing null into [] hid live sessions and let
      // a stale run be mistaken for a new one.
      expect(parseRunsResponse(body)).toBeNull();
    },
  );
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
    (_label: string, body: string) => {
      // Treating an unreadable jobs response as "no steps" dragged a running
      // session's phase backwards to requested on one flaky poll.
      expect(parseJobStepsResponse(body)).toBeNull();
    },
  );
});
