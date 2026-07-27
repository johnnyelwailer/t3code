import { ATLASSIAN_OAUTH_FLOW_TTL_MS as SHARED_FLOW_TTL_MS } from "@t3tools/integrations-atlassian";
import { assert, describe, expect, it } from "vite-plus/test";
import { afterEach } from "vite-plus/test";

import {
  ATLASSIAN_OAUTH_FLOW_COMPLETED_RETENTION_MS,
  ATLASSIAN_OAUTH_FLOW_MAX_PENDING,
  ATLASSIAN_OAUTH_FLOW_TTL_MS,
  consumePendingAtlassianOAuthFlow,
  markAtlassianOAuthFlowCompleted,
  pendingAtlassianOAuthFlowCount,
  putPendingAtlassianOAuthFlow,
  readAtlassianOAuthFlowStatus,
  readPendingAtlassianOAuthFlow,
  resetPendingAtlassianOAuthFlows,
  type PendingAtlassianOAuthFlow,
} from "./t3team-atlassian-oauth-flowStore.ts";

afterEach(() => {
  resetPendingAtlassianOAuthFlows();
});

function flow(state: string, createdAtMs: number): PendingAtlassianOAuthFlow {
  return {
    state,
    codeVerifier: `verifier-${state}`,
    authorizeUrl: `https://auth.atlassian.com/authorize?state=${state}`,
    redirectUri: "http://localhost:5736/oauth/callback",
    createdAtMs,
  };
}

describe("pending Atlassian OAuth flow store", () => {
  it("expires on the same shared TTL the client waits for, so neither side can drift", () => {
    // The client's `waitForOAuthCallback` default comes from the same constant. If this ever fails,
    // one side is giving up while the other is still hoping — see ATLASSIAN_OAUTH_FLOW_TTL_MS.
    assert.equal(ATLASSIAN_OAUTH_FLOW_TTL_MS, SHARED_FLOW_TTL_MS);
    assert.equal(ATLASSIAN_OAUTH_FLOW_TTL_MS, 15 * 60 * 1000);
  });

  it("returns a stored flow without spending it, so the shareable link can be reopened", () => {
    putPendingAtlassianOAuthFlow(flow("a", 1_000), 1_000);

    assert.equal(readPendingAtlassianOAuthFlow("a", 1_000)?.codeVerifier, "verifier-a");
    assert.equal(readPendingAtlassianOAuthFlow("a", 2_000)?.codeVerifier, "verifier-a");
    assert.equal(pendingAtlassianOAuthFlowCount(), 1);
  });

  it("has nothing for a state it never issued", () => {
    putPendingAtlassianOAuthFlow(flow("a", 1_000), 1_000);

    assert.isUndefined(readPendingAtlassianOAuthFlow("b", 1_000));
    assert.isUndefined(consumePendingAtlassianOAuthFlow("b", 1_000));
  });

  it("spends a flow exactly once, so a replayed state finds nothing", () => {
    putPendingAtlassianOAuthFlow(flow("a", 1_000), 1_000);

    assert.equal(consumePendingAtlassianOAuthFlow("a", 1_000)?.codeVerifier, "verifier-a");
    assert.isUndefined(consumePendingAtlassianOAuthFlow("a", 1_000));
    assert.isUndefined(readPendingAtlassianOAuthFlow("a", 1_000));
    assert.equal(pendingAtlassianOAuthFlowCount(), 0);
  });

  it("expires a flow at the TTL boundary and not a millisecond before", () => {
    putPendingAtlassianOAuthFlow(flow("a", 1_000), 1_000);

    assert.isDefined(readPendingAtlassianOAuthFlow("a", 1_000 + ATLASSIAN_OAUTH_FLOW_TTL_MS - 1));
    assert.isUndefined(readPendingAtlassianOAuthFlow("a", 1_000 + ATLASSIAN_OAUTH_FLOW_TTL_MS));
    assert.isUndefined(consumePendingAtlassianOAuthFlow("a", 1_000 + ATLASSIAN_OAUTH_FLOW_TTL_MS));
  });

  it("sweeps every expired flow on access, not just the one being looked up", () => {
    putPendingAtlassianOAuthFlow(flow("stale-1", 0), 0);
    putPendingAtlassianOAuthFlow(flow("stale-2", 0), 0);
    assert.equal(pendingAtlassianOAuthFlowCount(), 2);

    putPendingAtlassianOAuthFlow(
      flow("fresh", ATLASSIAN_OAUTH_FLOW_TTL_MS),
      ATLASSIAN_OAUTH_FLOW_TTL_MS,
    );

    assert.equal(pendingAtlassianOAuthFlowCount(), 1);
    assert.isDefined(readPendingAtlassianOAuthFlow("fresh", ATLASSIAN_OAUTH_FLOW_TTL_MS));
  });

  it("evicts the oldest flows once the cap is exceeded, so it cannot grow without limit", () => {
    const total = ATLASSIAN_OAUTH_FLOW_MAX_PENDING + 5;
    for (let index = 0; index < total; index++) {
      // All within the TTL: eviction here is the cap doing the work, not expiry.
      putPendingAtlassianOAuthFlow(flow(`s${index}`, 1_000 + index), 1_000 + index);
    }

    assert.equal(pendingAtlassianOAuthFlowCount(), ATLASSIAN_OAUTH_FLOW_MAX_PENDING);
    assert.isUndefined(readPendingAtlassianOAuthFlow("s0", 2_000));
    assert.isUndefined(readPendingAtlassianOAuthFlow("s4", 2_000));
    assert.isDefined(readPendingAtlassianOAuthFlow("s5", 2_000));
    assert.isDefined(readPendingAtlassianOAuthFlow(`s${total - 1}`, 2_000));
  });

  it("never exposes a verifier for a flow it has forgotten", () => {
    putPendingAtlassianOAuthFlow(flow("a", 0), 0);
    consumePendingAtlassianOAuthFlow("a", 0);

    expect(readPendingAtlassianOAuthFlow("a", 0)).toBeUndefined();
  });
});

describe("Atlassian OAuth flow status", () => {
  it("is pending while the flow is still in the store, unknown once it never existed", () => {
    putPendingAtlassianOAuthFlow(flow("a", 0), 0);

    assert.equal(readAtlassianOAuthFlowStatus("a", 0), "pending");
    assert.equal(readAtlassianOAuthFlowStatus("never-issued", 0), "unknown");
  });

  it("is completed once marked, even though consuming already removed it from pendingFlows", () => {
    putPendingAtlassianOAuthFlow(flow("a", 0), 0);
    consumePendingAtlassianOAuthFlow("a", 0);
    markAtlassianOAuthFlowCompleted("a", 0);

    assert.equal(readAtlassianOAuthFlowStatus("a", 0), "completed");
  });

  it("forgets a completed marker after its retention window, reporting unknown again", () => {
    markAtlassianOAuthFlowCompleted("a", 0);

    assert.equal(
      readAtlassianOAuthFlowStatus("a", ATLASSIAN_OAUTH_FLOW_COMPLETED_RETENTION_MS - 1),
      "completed",
    );
    assert.equal(
      readAtlassianOAuthFlowStatus("a", ATLASSIAN_OAUTH_FLOW_COMPLETED_RETENTION_MS),
      "unknown",
    );
  });
});
