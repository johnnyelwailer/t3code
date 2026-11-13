import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLOUD_SESSION_CREATING_ID } from "~/cloud/t3team-cloudSessionTargetLogic";
import {
  presentRunOnSelection,
  reduceRunOnSelection,
  runOnCloudRowDetail,
  runOnSelectionStatus,
  type RunOnSelectionEvent,
  type RunOnSelectionTarget,
} from "./t3team-runOnSelection";

const OLD: RunOnSelectionTarget = {
  sessionId: "session-0834",
  label: "polassist · 8:34 AM",
  projectKey: "hive/pti-polassist",
  createFailed: false,
};

const run = (...events: readonly RunOnSelectionEvent[]): RunOnSelectionTarget | null =>
  events.reduce<RunOnSelectionTarget | null>(
    (state, event) => reduceRunOnSelection(state, event),
    OLD,
  );

const CREATE = {
  kind: "create",
  label: "New cloud session",
  projectKey: "hive/pti-polassist",
} as const;

const session = (overrides: Partial<CloudSession>): CloudSession =>
  ({
    sessionId: "session-new",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 60,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  }) as CloudSession;

const statusOf = (state: RunOnSelectionTarget | null, phase: CloudSessionPhase | null) => {
  expect(state).not.toBeNull();
  return runOnSelectionStatus(state!, phase);
};

describe("reduceRunOnSelection", () => {
  it("takes the selection off the old session the moment a new one is asked for", () => {
    const state = run(CREATE);
    expect(state).toEqual({
      sessionId: CLOUD_SESSION_CREATING_ID,
      label: "New cloud session",
      projectKey: "hive/pti-polassist",
      createFailed: false,
      staleLocalSessionId: null,
    });
  });

  it("never resolves the new entry to the previous create's session (the 08:34 revert)", () => {
    // The window still holds the 08:34 session as its last create; the list refresh that follows
    // the pick must not take it for the answer.
    const picked = run({ ...CREATE, staleLocalSessionId: "session-0834" });
    const stale = reduceRunOnSelection(picked, {
      kind: "created",
      sessionId: "session-0834",
      label: "polassist · 8:34 AM",
    });
    expect(stale).toBe(picked);
    expect(stale?.sessionId).toBe(CLOUD_SESSION_CREATING_ID);
    const fresh = reduceRunOnSelection(stale, {
      kind: "created",
      sessionId: "session-new",
      label: "polassist",
    });
    expect(fresh).toMatchObject({ sessionId: "session-new", createFailed: false });
  });

  it("replaces the creating entry in place once the run id is known", () => {
    const state = run(CREATE, { kind: "created", sessionId: "session-new", label: "polassist" });
    expect(state).toMatchObject({ sessionId: "session-new", label: "polassist" });
    // Still the composer's project: the create was tagged with it and the answer does not retag.
    expect(state?.projectKey).toBe("hive/pti-polassist");
  });

  it("ignores a create answer that no longer belongs to the selection", () => {
    // The user picked a different machine while the create was in flight.
    const picked = run(CREATE, {
      kind: "pick",
      sessionId: "session-other",
      label: "other",
      projectKey: "hive/pti-polassist",
    });
    const after = reduceRunOnSelection(picked, {
      kind: "created",
      sessionId: "session-new",
      label: "polassist",
    });
    expect(after).toBe(picked);
  });

  it("keeps the failed create selected instead of reverting to the old session", () => {
    const state = run(CREATE, {
      kind: "createFailed",
      message: "Sign in first: the account entry at the bottom of Settings.",
      reason: "broker_sign_in_required",
    });
    expect(state).toMatchObject({
      sessionId: CLOUD_SESSION_CREATING_ID,
      createFailed: true,
      createFailureMessage: "Sign in first: the account entry at the bottom of Settings.",
      createFailureReason: "broker_sign_in_required",
    });
    expect(state?.sessionId).not.toBe(OLD.sessionId);
  });

  it("clears the failure flag when the entry is retried or re-picked", () => {
    const failed = run(CREATE, { kind: "createFailed" });
    expect(reduceRunOnSelection(failed, CREATE)?.createFailed).toBe(false);
  });

  it("cannot fail a selection that already has a session", () => {
    expect(reduceRunOnSelection(OLD, { kind: "createFailed" })).toBe(OLD);
  });

  it("drops the selection on clear", () => {
    expect(run({ kind: "clear" })).toBeNull();
  });
});

describe("runOnSelectionStatus", () => {
  it("walks pick → pending → ready on the one entry", () => {
    const creating = run(CREATE);
    expect(statusOf(creating, null)).toBe("requesting");
    const created = reduceRunOnSelection(creating, {
      kind: "created",
      sessionId: "session-new",
      label: "polassist",
    });
    // The server answered before its run is listed: still the same entry, still working.
    expect(statusOf(created, null)).toBe("provisioning");
    expect(statusOf(created, "requested")).toBe("provisioning");
    expect(statusOf(created, "preparing")).toBe("provisioning");
    expect(statusOf(created, "ready")).toBe("ready");
  });

  it("reads a create that never reached a machine as a failure to retry", () => {
    const words = presentRunOnSelection(statusOf(run(CREATE, { kind: "createFailed" }), null));
    expect(words).toMatchObject({ title: "Shut down", retry: true });
  });

  it("reads every ending of the selected session as shut down, with Retry", () => {
    for (const phase of ["failed", "stopped", "cancelled"] as const) {
      const status = statusOf(run(CREATE, { kind: "created", sessionId: "s", label: "l" }), phase);
      expect(status, phase).toBe("shutDown");
      expect(presentRunOnSelection(status)).toMatchObject({ title: "Shut down", retry: true });
    }
  });

  it("offers no retry while the machine is still on its way", () => {
    for (const status of ["requesting", "provisioning", "ready"] as const) {
      expect(presentRunOnSelection(status).retry, status).toBe(false);
    }
  });
});

describe("runOnCloudRowDetail", () => {
  it("reads a failed machine as a shut-down one, without the step that broke", () => {
    const detail = runOnCloudRowDetail(
      session({ phase: "failed", failureReason: 'at "Capture connect status"' }),
    );
    expect(detail).toBe("Shut down");
    expect(detail).not.toContain("Failed");
    expect(detail).not.toContain("Capture connect status");
  });

  it("leaves every other phase reading as it does in the panel", () => {
    expect(runOnCloudRowDetail(session({ phase: "ready" }))).toBe(
      "Ready · ubuntu-slim · 12 GB · 4 cores",
    );
    expect(runOnCloudRowDetail(session({ phase: "preparing" }))).toBe("Building workspace · 1m 0s");
  });
});
