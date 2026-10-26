import { CLOUD_SESSION_HOLD_CEILING_SECONDS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import type { WorkflowRunSummary } from "./t3team-githubActionsSessionClient.ts";
import { attachFailure } from "./t3team-brokerAttach.ts";

const CREATED_AT = "2026-10-24T08:00:00Z";
const createdMs = Date.parse(CREATED_AT);
const repoRef = {
  host: "ghe.example",
  owner: "hive",
  repo: "fleet",
  workflowFileName: "session.yml",
};

const run: WorkflowRunSummary = {
  id: 301,
  status: "in_progress",
  conclusion: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  htmlUrl: "https://ghe.example/hive/fleet/actions/runs/301",
  name: "hive/fleet [main] [c9f4a2] · broker",
  actor: "pj",
};

const stepsBody = (steps: ReadonlyArray<readonly [string, string, string | null, string?]>) =>
  JSON.stringify({
    jobs: [
      {
        steps: steps.map(([name, status, conclusion, started_at]) => ({
          name,
          status,
          conclusion,
          ...(started_at !== undefined ? { started_at } : {}),
        })),
      },
    ],
  });

const holding = stepsBody([
  ["Set up job", "completed", "success"],
  ["Start t3 serve and wait for pairing details", "completed", "success"],
  ["Capture connect status", "completed", "success"],
  ["Hold the session until release, then stop t3 serve", "in_progress", null, CREATED_AT],
]);

const project = (r: WorkflowRunSummary, body: string, ageSeconds: number) =>
  projectCloudSession(r, createdMs + ageSeconds * 1000, "ubuntu", repoRef, () =>
    Effect.succeed({ body, truncated: false }),
  );

describe("projectCloudSession remainingSeconds", () => {
  it.effect("counts the hold from its own start step, not the run's creation or a re-run", () =>
    Effect.gen(function* () {
      const holdStart = "2026-10-24T09:00:00Z";
      const reRun = stepsBody([
        ["Capture connect status", "completed", "success", "2026-10-24T08:55:00Z"],
        ["Hold the session until the handoff window", "in_progress", null, holdStart],
      ]);
      const session = yield* project(run, reRun, 2 * 3600);
      const endsAtMs = Date.parse(holdStart) + CLOUD_SESSION_HOLD_CEILING_SECONDS * 1000;
      expect(session.endsAt).toBe(DateTime.formatIso(DateTime.makeUnsafe(endsAtMs)));
      expect(session.remainingSeconds).toBe(
        Math.floor((endsAtMs - (createdMs + 2 * 3600 * 1000)) / 1000),
      );
    }),
  );

  it.effect("counts what is left of the hold ceiling for a ready session", () =>
    Effect.gen(function* () {
      const session = yield* project(run, holding, 60 * 60);
      expect(session.phase).toBe("ready");
      expect(session.remainingSeconds).toBe(CLOUD_SESSION_HOLD_CEILING_SECONDS - 3600);
      expect(session.endsAt).toBe(
        DateTime.formatIso(
          DateTime.makeUnsafe(createdMs + CLOUD_SESSION_HOLD_CEILING_SECONDS * 1000),
        ),
      );
    }),
  );

  it.effect("keeps a ready session with a pending hold retryable through a broker blip", () =>
    Effect.gen(function* () {
      const pending = stepsBody([
        ["Capture connect status", "completed", "success"],
        ["Relay environment cloud-env", "completed", "success"],
        ["Wait for a claim", "completed", "success"],
        ["Hold the session until release, then stop t3 serve", "pending", null],
      ]);
      const age = CLOUD_SESSION_HOLD_CEILING_SECONDS + 600;
      const session = yield* project(run, pending, age);
      expect(session.phase).toBe("ready");
      expect(session.environmentId).toBe("cloud-env");
      expect(session.endsAt).toBeUndefined();
      expect(attachFailure([], session, 0, createdMs + age * 1000).reason).toBe("unknown_session");
      expect(attachFailure([], session, 60_000, createdMs + age * 1000).reason).toBe(
        "unknown_session",
      );
    }),
  );

  it.effect("keeps an estimated warning remainder without claiming a real hold deadline", () =>
    Effect.gen(function* () {
      const body = stepsBody([
        ["Capture connect status", "completed", "success"],
        ["Hold the session until release, then stop t3 serve", "in_progress", null],
      ]);
      const session = yield* project(run, body, 3600);
      expect(session.endsAt).toBeUndefined();
      expect(session.remainingSeconds).toBe(CLOUD_SESSION_HOLD_CEILING_SECONDS - 3600);
    }),
  );

  it.effect("never goes negative past the ceiling", () =>
    Effect.gen(function* () {
      const session = yield* project(run, holding, CLOUD_SESSION_HOLD_CEILING_SECONDS + 600);
      expect(session.remainingSeconds).toBe(0);
    }),
  );

  it.effect("says nothing before the session holds a machine", () =>
    Effect.gen(function* () {
      const preparing = stepsBody([["Set up job", "in_progress", null]]);
      const session = yield* project(run, preparing, 120);
      expect(session.phase).toBe("preparing");
      expect(session.remainingSeconds).toBeNull();
    }),
  );

  it.effect("says nothing about a session released while the run still winds down", () =>
    Effect.gen(function* () {
      const released = stepsBody([
        ["Capture connect status", "completed", "success"],
        ["Hold the session until release, then stop t3 serve", "completed", "success"],
        ["Complete job", "in_progress", null],
      ]);
      const session = yield* project(run, released, 3600);
      expect(session.phase).toBe("stopped");
      expect(session.remainingSeconds).toBeNull();
    }),
  );
});
