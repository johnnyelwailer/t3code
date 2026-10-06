import { describe, expect, it } from "@effect/vitest";

import { sessionToAttach } from "./t3team-NexiBrokerService.ts";

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
