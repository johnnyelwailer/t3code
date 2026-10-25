import { describe, expect, it } from "vite-plus/test";

import { cloudSessionPhase } from "./t3team-cloudSessionPhase.fixtures.ts";
import { cloudSessionTimings } from "./t3team-cloudSessionTimings.fixtures.ts";
import type { WorkflowJobStep, WorkflowRunSummary } from "./t3team-cloudSessionActionsRequests.ts";
import { environmentIdFromSteps } from "./t3team-cloudSessionEnvironmentStep.ts";
import {
  type CloudSessionPhase,
  cloudSessionDurationSeconds,
  cloudSessionElapsedSeconds,
  cloudSessionHoldEnd,
  deriveCloudSessionPhase,
  deriveMachineStage,
} from "./t3team-cloudSessionPhase.ts";

const runOf = (status: string, conclusion: string | null): WorkflowRunSummary => ({
  id: 1,
  status,
  conclusion,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:30:00Z",
  htmlUrl: "",
  name: "n",
  actor: "pj",
});

/** `name|status|conclusion|startedAt` joined by `;`; `-` is null/absent, `null` is unreadable. */
const decodeSteps = (text: string): WorkflowJobStep[] | null => {
  if (text === "null") return null;
  if (text === "") return [];
  return text.split(";").map((part) => {
    const [name = "", status = "", conclusion = "-", startedAt = "-"] = part.split("|");
    return {
      name,
      status,
      conclusion: conclusion === "-" ? null : conclusion,
      ...(startedAt === "-" ? {} : { startedAt }),
    };
  });
};

describe("phase derivation (golden)", () => {
  it("matches the old derivation on every run-status x conclusion x step-state row", () => {
    expect(cloudSessionPhase.length).toBeGreaterThanOrEqual(300);
    const seen = new Set<string>();
    for (const row of cloudSessionPhase) {
      const [input, output = ""] = row.split(" => ");
      const [runPart = "", stepsPart = ""] = [
        input!.slice(0, input!.indexOf("#")),
        input!.slice(input!.indexOf("#") + 1),
      ];
      const [status = "", conclusion = "-"] = runPart.split("|");
      const steps = decodeSteps(stepsPart);
      const [phase, stage, environmentId] = output.split(" ");
      expect(
        deriveCloudSessionPhase(runOf(status, conclusion === "-" ? null : conclusion), steps),
        row,
      ).toBe(phase);
      expect(deriveMachineStage(steps) ?? "-", row).toBe(stage);
      expect(environmentIdFromSteps(steps) ?? "-", row).toBe(environmentId);
      seen.add(phase!);
    }
    expect([...seen].toSorted()).toEqual([
      "cancelled",
      "failed",
      "preparing",
      "queued",
      "ready",
      "requested",
      "starting",
      "stopped",
    ]);
  });
});

describe("phase derivation (explicit table)", () => {
  const step = (
    name: string,
    status: string,
    conclusion: string | null = null,
  ): WorkflowJobStep => ({
    name,
    status,
    conclusion,
  });
  const done = (name: string) => step(name, "completed", "success");
  const HOLD = "Hold the session until release, then stop";
  const HANDOFF = "Hold the session until the handoff window";

  const table: ReadonlyArray<
    readonly [
      string,
      string,
      string | null,
      ReadonlyArray<WorkflowJobStep> | null,
      CloudSessionPhase,
    ]
  > = [
    ["queued run", "queued", null, null, "queued"],
    ["pending run", "pending", null, [], "queued"],
    ["waiting run (environment approval)", "waiting", null, [], "queued"],
    ["completed success", "completed", "success", null, "stopped"],
    ["completed cancelled", "completed", "cancelled", [], "cancelled"],
    ["completed failure", "completed", "failure", [done(HOLD)], "failed"],
    ["completed skipped is not a normal end", "completed", "skipped", [], "failed"],
    ["completed timed_out", "completed", "timed_out", [], "failed"],
    ["in progress, steps unreadable", "in_progress", null, null, "preparing"],
    ["in progress, authoritative no steps", "in_progress", null, [], "requested"],
    ["checkout running", "in_progress", null, [step("Checkout", "in_progress")], "preparing"],
    ["checkout queued only", "in_progress", null, [step("Checkout", "queued")], "preparing"],
    [
      "install failed still counts as reached",
      "in_progress",
      null,
      [done("Checkout"), step("Install dependencies", "completed", "failure")],
      "preparing",
    ],
    [
      "start t3 serve running",
      "in_progress",
      null,
      [done("Checkout"), step("Start t3 serve and wait", "in_progress")],
      "starting",
    ],
    [
      "start t3 serve failed does not march backwards",
      "in_progress",
      null,
      [step("Start t3 serve", "completed", "failure")],
      "starting",
    ],
    [
      "start t3 serve skipped is not reached",
      "in_progress",
      null,
      [done("Checkout"), step("Start t3 serve", "completed", "skipped")],
      "preparing",
    ],
    [
      "capture connect status success is ready",
      "in_progress",
      null,
      [done("Capture connect status")],
      "ready",
    ],
    [
      "capture connect status failure is not ready",
      "in_progress",
      null,
      [step("Capture connect status", "completed", "failure")],
      "preparing",
    ],
    [
      "hold running is ready",
      "in_progress",
      null,
      [done("Capture connect status"), step(HOLD, "in_progress")],
      "ready",
    ],
    [
      "hold skipped after early failure is not ready",
      "in_progress",
      null,
      [step("Start t3 serve", "completed", "failure"), step(HOLD, "completed", "skipped")],
      "starting",
    ],
    [
      "release hold completed success is stopped",
      "in_progress",
      null,
      [step(HOLD, "completed", "success")],
      "stopped",
    ],
    [
      "release hold completed cancelled is cancelled",
      "in_progress",
      null,
      [step(HOLD, "completed", "cancelled")],
      "cancelled",
    ],
    [
      "release hold completed failure is failed",
      "in_progress",
      null,
      [step(HOLD, "completed", "failure")],
      "failed",
    ],
    [
      "release hold skipped falls through",
      "in_progress",
      null,
      [step(HOLD, "completed", "skipped")],
      "preparing",
    ],
    [
      "finished handoff window alone does not end the session",
      "in_progress",
      null,
      [step(HANDOFF, "completed", "success")],
      "ready",
    ],
    [
      "legacy hold step name",
      "in_progress",
      null,
      [step("Hold the session, then stop t3 serve", "completed", "success")],
      "stopped",
    ],
    [
      "unknown step names degrade to preparing",
      "in_progress",
      null,
      [done("Something new")],
      "preparing",
    ],
    [
      "standby secrets step skipped is not progress",
      "in_progress",
      null,
      [step("Redeem the session's secrets", "completed", "skipped")],
      "preparing",
    ],
  ];

  it.each(table)("%s", (_label, status, conclusion, steps, expected) => {
    expect(deriveCloudSessionPhase(runOf(status, conclusion), steps)).toBe(expected);
  });

  it("derives the machine stage from the most advanced reached step", () => {
    expect(deriveMachineStage(null)).toBeUndefined();
    expect(deriveMachineStage([])).toBeUndefined();
    expect(
      deriveMachineStage([step("Redeem the session's secrets", "completed", "skipped")]),
    ).toBeUndefined();
    expect(deriveMachineStage([step("Bring up the project machine", "in_progress")])).toBe(
      "building",
    );
    expect(
      deriveMachineStage([
        done("Bring up the project machine"),
        step("Check the project machine", "in_progress"),
      ]),
    ).toBe("checking");
    expect(
      deriveMachineStage([
        done("Check the project machine"),
        step("Install the prebuilt server bundle", "queued"),
      ]),
    ).toBe("checking");
    expect(
      deriveMachineStage([
        done("Check the project machine"),
        done("Install dependencies and build"),
      ]),
    ).toBe("installing");
  });
});

describe("phase timings (golden)", () => {
  it("matches the old elapsed, duration and hold-end figures, bad dates included", () => {
    expect(cloudSessionTimings.length).toBeGreaterThanOrEqual(100);
    for (const text of cloudSessionTimings) {
      const row = JSON.parse(text) as {
        createdAt: string;
        updatedAt: string;
        now: number;
        phase: CloudSessionPhase;
        stepStart: string | null;
        elapsed: number;
        duration: number;
        hold: unknown;
      };
      const run = {
        ...runOf("in_progress", null),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      const steps: WorkflowJobStep[] = [
        {
          name: "Hold the session until release",
          status: "in_progress",
          conclusion: null,
          ...(row.stepStart === null ? {} : { startedAt: row.stepStart }),
        },
      ];
      let hold: unknown;
      try {
        hold = cloudSessionHoldEnd(row.phase, run, steps, row.now);
      } catch (error) {
        hold = `throws:${(error as Error).name}`;
      }
      expect(cloudSessionElapsedSeconds(run, row.now), text).toBe(row.elapsed);
      expect(cloudSessionDurationSeconds(run), text).toBe(row.duration);
      expect(JSON.parse(JSON.stringify(hold)), text).toEqual(row.hold);
    }
  });

  it("formats `endsAt` as an ISO-8601 UTC instant with milliseconds, without effect/DateTime", () => {
    const run = runOf("in_progress", null);
    const steps = [
      {
        name: "Hold the session until release",
        status: "in_progress",
        conclusion: null,
        startedAt: "2026-10-01T10:05:00Z",
      },
    ];
    const hold = cloudSessionHoldEnd("ready", run, steps, Date.parse("2026-10-01T10:05:00Z"));
    expect(hold?.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(hold?.endsAt).toBe("2026-10-01T15:50:00.000Z");
  });

  it("never reports negative elapsed or duration time, and 0 for an unreadable date", () => {
    expect(
      cloudSessionElapsedSeconds(runOf("in_progress", null), Date.parse("2020-01-01T00:00:00Z")),
    ).toBe(0);
    expect(
      cloudSessionElapsedSeconds({ ...runOf("in_progress", null), createdAt: "nope" }, 1),
    ).toBe(0);
    expect(cloudSessionDurationSeconds({ ...runOf("completed", "success"), updatedAt: "" })).toBe(
      0,
    );
  });
});
