import { describe, expect, it } from "vite-plus/test";

import {
  resolveMyWorkDigestRenderState,
  type MyWorkDigestRenderInput,
} from "~/t3team/t3team-myWorkDigestRenderState";

const base: MyWorkDigestRenderInput = {
  status: "loading",
  freshness: "cached",
  sessionExpired: false,
  viewerUnresolved: false,
  hasGraph: false,
  ticketCount: 0,
};

const resolve = (overrides: Partial<MyWorkDigestRenderInput>) =>
  resolveMyWorkDigestRenderState({ ...base, ...overrides });

describe("My Work digest render state", () => {
  it("never shows an empty state before a fresh result for the scope", () => {
    // The cold start, in every shape it takes: the first poll is out; the poll answered but the
    // graph came from the cache; a slow first poll left the status on "loading" for a while.
    expect(resolve({})).toBe("loading");
    expect(resolve({ status: "ready", freshness: "cached" })).toBe("loading");
    expect(resolve({ status: "loading", freshness: "cached" })).toBe("loading");
  });

  it("shows the empty state once a fresh, successful round came back with nothing", () => {
    expect(resolve({ status: "ready", freshness: "fresh" })).toBe("empty");
  });

  it("paints a cached graph instead of waiting, and keeps painting while it revalidates", () => {
    expect(resolve({ hasGraph: true, ticketCount: 3, status: "ready" })).toBe("content");
    expect(resolve({ hasGraph: true, ticketCount: 3, status: "retrying" })).toBe("content");
  });

  it("keeps a transient failure out of the empty state", () => {
    expect(resolve({ status: "retrying" })).toBe("retrying");
    // Even once the poller has answered before: a failed round is not an empty answer.
    expect(resolve({ status: "retrying", freshness: "fresh" })).toBe("retrying");
  });

  it("puts sign-in, session-expired and error ahead of any content decision", () => {
    expect(resolve({ sessionExpired: true, hasGraph: true, ticketCount: 5 })).toBe(
      "session-expired",
    );
    expect(resolve({ status: "error", hasGraph: true, ticketCount: 5 })).toBe("error");
    // No Jira identity: an empty graph says nothing about the user's work.
    expect(resolve({ viewerUnresolved: true, hasGraph: true, ticketCount: 0 })).toBe("sign-in");
    expect(resolve({ viewerUnresolved: true, status: "ready", freshness: "fresh" })).toBe(
      "sign-in",
    );
    // …but tickets DID come back, so the viewer flag is stale information: render them.
    expect(resolve({ viewerUnresolved: true, hasGraph: true, ticketCount: 2 })).toBe("content");
  });
});
