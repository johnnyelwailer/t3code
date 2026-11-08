import { CloudSessionFailedError, type CloudSessionListResult } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionNotSeenYet } from "../cloud/t3team-cloudSessionSetupModel";
import { cloudSessionListState } from "./t3team-cloudSessions";

const listing: CloudSessionListResult = {
  configured: true,
  sessions: [
    {
      sessionId: "old-session",
      providerKind: "github_actions",
      phase: "ready",
      elapsedSeconds: 0,
      remainingSeconds: null,
      machineLabel: "ubuntu-slim",
      failureReason: null,
      detailsUrl: null,
    },
  ],
};
const cause = Cause.fail(
  new CloudSessionFailedError({ reason: "unreachable", message: "The host could not be reached." }),
);

describe("cloudSessionListState", () => {
  it("reports a clean answer as not stale", () => {
    expect(cloudSessionListState(AsyncResult.success(listing)).refreshFailed).toBe(false);
  });

  it("keeps the old rows after a failed refresh, flagged as possibly stale", () => {
    const state = cloudSessionListState(
      AsyncResult.failureWithPrevious(cause, {
        previous: Option.some(AsyncResult.success(listing)),
      }),
    );
    expect(state.sessions.map((item) => item.sessionId)).toEqual(["old-session"]);
    expect(state.loadError).toBeNull();
    expect(state.refreshFailed).toBe(true);
  });

  it("does not flag a list that never answered as stale; it reports why instead", () => {
    const state = cloudSessionListState(AsyncResult.failure(cause));
    expect(state.refreshFailed).toBe(false);
    expect(state.loadError).not.toBeNull();
  });

  it("gives no evidence that a session is missing from a list whose refresh failed", () => {
    const answered = cloudSessionListState(AsyncResult.success(listing));
    const stale = cloudSessionListState(
      AsyncResult.failureWithPrevious(cause, {
        previous: Option.some(AsyncResult.success(listing)),
      }),
    );
    const missing = (state: typeof answered) =>
      cloudSessionNotSeenYet({
        loading: state.loading,
        loadError: state.loadError,
        refreshFailed: state.refreshFailed,
        sessionId: "new-session",
        session: state.sessions.find((item) => item.sessionId === "new-session") ?? null,
      });
    expect(missing(answered)).toBe(true);
    expect(missing(stale)).toBe(false);
  });
});
