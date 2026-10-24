import { describe, expect, it } from "vite-plus/test";

import { ConnectionTransientError } from "./model.ts";
import { isSessionEndedFailure, sessionEndedError } from "./t3team-brokerConnection.ts";
import { presentConnectionState } from "./presentation.ts";

describe("sessionEndedError", () => {
  it("is blocked, not transient, and recognised as an ended session", () => {
    const error = sessionEndedError("That cloud session has ended.");
    expect(error._tag).toBe("ConnectionBlockedError");
    expect(isSessionEndedFailure(error)).toBe(true);
  });

  it("is not confused with an ordinary failure", () => {
    expect(isSessionEndedFailure(null)).toBe(false);
    expect(
      isSessionEndedFailure(new ConnectionTransientError({ reason: "network", detail: "x" })),
    ).toBe(false);
  });

  it("parks the connection as an error instead of 'reconnecting'", () => {
    const state = {
      desired: true,
      network: "online",
      phase: "blocked",
      stage: null,
      attempt: 1,
      generation: 0,
      lastFailure: sessionEndedError("gone"),
      retryAt: null,
    } as const;
    expect(presentConnectionState(state).phase).toBe("error");
  });
});
