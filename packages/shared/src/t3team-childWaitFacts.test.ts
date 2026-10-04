/**
 * The open-child-wait predicate (GHE #55 follow-up): the DECLARED waiting fact.
 * A registered `t3team.child_wait.registered` activity opens a waitId; a
 * matching `t3team.child_wait.resolved` (same waitId) closes it. The thread
 * reads "declared waiting" while any waitId is open.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  CHILD_WAIT_REGISTERED_KIND,
  CHILD_WAIT_RESOLVED_KIND,
  hasOpenChildWaits,
} from "./t3team-childWaitFacts.ts";

const registered = (waitId: string, childThreadId = "child-1") => ({
  kind: CHILD_WAIT_REGISTERED_KIND,
  payload: { waitId, childThreadId },
});
const resolved = (waitId: string, childThreadId = "child-1") => ({
  kind: CHILD_WAIT_RESOLVED_KIND,
  payload: { waitId, childThreadId },
});

describe("hasOpenChildWaits", () => {
  it("is false with no activities", () => {
    expect(hasOpenChildWaits([])).toBe(false);
  });

  it("is true while a registered wait has no matching resolved", () => {
    expect(hasOpenChildWaits([registered("w1")])).toBe(true);
    expect(hasOpenChildWaits([registered("w1"), resolved("w2")])).toBe(true);
  });

  it("is false once the matching wait resolves (same waitId)", () => {
    expect(hasOpenChildWaits([registered("w1"), resolved("w1")])).toBe(false);
    // Order: resolved after registered closes the open set.
    expect(hasOpenChildWaits([registered("w1"), resolved("w2"), resolved("w1")])).toBe(false);
  });

  it("stays true when a SECOND wait is still open after one resolves", () => {
    expect(hasOpenChildWaits([registered("w1"), registered("w2"), resolved("w1")])).toBe(true);
    expect(
      hasOpenChildWaits([registered("w1"), registered("w2"), resolved("w1"), resolved("w2")]),
    ).toBe(false);
  });

  it("ignores malformed payloads (non-object / missing waitId)", () => {
    expect(
      hasOpenChildWaits([
        { kind: CHILD_WAIT_REGISTERED_KIND, payload: null },
        { kind: CHILD_WAIT_REGISTERED_KIND, payload: { childThreadId: "child-1" } },
        { kind: CHILD_WAIT_REGISTERED_KIND, payload: "not-an-object" },
      ]),
    ).toBe(false);
  });

  it("ignores unrelated activity kinds even when they carry a waitId", () => {
    expect(
      hasOpenChildWaits([
        { kind: "t3team.handoff.created", payload: { waitId: "w1" } },
        { kind: "t3team.child_wait.registered", payload: { waitId: "w9" } },
      ]),
    ).toBe(true);
  });
});
