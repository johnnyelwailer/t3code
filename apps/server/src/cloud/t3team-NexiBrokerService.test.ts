import { describe, expect, it } from "@effect/vitest";

import { SESSION_ABSENT_GRACE_MS, makeAbsenceTracker } from "./t3team-brokerAbsence.ts";
import { attachFailure, sessionToAttach } from "./t3team-NexiBrokerService.ts";

const live = { runId: "300", environmentId: "env-ws" };
const other = { runId: "301", environmentId: "env-other" };

describe("sessionToAttach", () => {
  it("attaches the session asked for while it runs", () => {
    expect(sessionToAttach([live, other], { sessionId: "301", environmentId: "env-other" })).toBe(
      other,
    );
  });

  it("follows the workspace's environment to its live session once the known one ended", () => {
    expect(sessionToAttach([live, other], { sessionId: "200", environmentId: "env-ws" })).toBe(
      live,
    );
  });

  it("finds nothing for an ended session the client knows no environment for", () => {
    expect(sessionToAttach([live, other], { sessionId: "200" })).toBeUndefined();
  });

  it("takes the newest of two live sessions serving one environment", () => {
    const newer = { runId: "310", environmentId: "env-ws" };
    expect(sessionToAttach([live, newer], { sessionId: "200", environmentId: "env-ws" })).toBe(
      newer,
    );
  });

  it("does not attach a listed session whose environment is not the one the client expects", () => {
    expect(sessionToAttach([live, other], { sessionId: "301", environmentId: "env-ws" })).toBe(
      live,
    );
  });

  it("does not take a session that has not reported its environment yet", () => {
    const starting = { runId: "302", environmentId: null };
    expect(sessionToAttach([starting], { sessionId: "302" })).toBeUndefined();
  });
});

describe("attachFailure", () => {
  const gone = { sessionId: "200", environmentId: "env-gone" };

  it("keeps a session missing from the list retryable inside the grace: a broker restart or reconnect", () => {
    expect(attachFailure([live, other], gone, 0).reason).toBe("unknown_session");
    expect(attachFailure([], gone, SESSION_ABSENT_GRACE_MS - 1).reason).toBe("unknown_session");
  });

  it("calls a session absent beyond every recovery ended: terminal, so clients stop retrying", () => {
    expect(attachFailure([live, other], gone, SESSION_ABSENT_GRACE_MS).reason).toBe(
      "session_ended",
    );
  });

  it("keeps a listed session without an environment retryable however long it takes", () => {
    const starting = { runId: "302" };
    expect(
      attachFailure([live, starting], { sessionId: "302" }, 10 * SESSION_ABSENT_GRACE_MS).reason,
    ).toBe("unknown_session");
  });
});

describe("makeAbsenceTracker", () => {
  it("measures continuous absence from the first miss", () => {
    const tracker = makeAbsenceTracker();
    expect(tracker.absent("200", 1_000)).toBe(0);
    expect(tracker.absent("200", 61_000)).toBe(60_000);
  });

  it("starts over when the session is seen again", () => {
    const tracker = makeAbsenceTracker();
    tracker.absent("200", 1_000);
    tracker.present("200");
    expect(tracker.absent("200", 500_000)).toBe(0);
  });

  it("tracks sessions independently", () => {
    const tracker = makeAbsenceTracker();
    tracker.absent("200", 1_000);
    expect(tracker.absent("301", 100_000)).toBe(0);
  });
});
