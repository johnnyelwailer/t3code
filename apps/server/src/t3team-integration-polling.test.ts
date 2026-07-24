import { describe, expect, it } from "vite-plus/test";

import { createT3TeamPollFingerprint, toT3TeamPollResult } from "./t3team-integration-polling.ts";

describe("t3team integration polling", () => {
  it("produces a stable fingerprint for the same payload", () => {
    const payload = {
      items: [{ id: "one", title: "Issue 1" }],
      warning: "none",
    };

    expect(createT3TeamPollFingerprint(payload)).toBe(createT3TeamPollFingerprint(payload));
  });

  it("returns the payload when the client fingerprint is missing", () => {
    const payload = { items: [{ id: "one" }] };

    expect(
      toT3TeamPollResult(payload, {
        enabled: true,
      }),
    ).toEqual({
      unchanged: false,
      fingerprint: createT3TeamPollFingerprint(payload),
      value: payload,
    });
  });

  it("returns unchanged when the client fingerprint matches", () => {
    const payload = { items: [{ id: "one" }] };

    expect(
      toT3TeamPollResult(payload, {
        enabled: true,
        knownFingerprint: createT3TeamPollFingerprint(payload),
      }),
    ).toEqual({
      unchanged: true,
      fingerprint: createT3TeamPollFingerprint(payload),
    });
  });

  it("produces the same fingerprint regardless of object key insertion order", () => {
    const a = { totalCount: 2, nextCursor: "abc", items: [{ id: "one", title: "Issue 1" }] };
    const b = { nextCursor: "abc", items: [{ title: "Issue 1", id: "one" }], totalCount: 2 };

    expect(createT3TeamPollFingerprint(a)).toBe(createT3TeamPollFingerprint(b));
  });

  it("still produces different fingerprints for different data", () => {
    const a = { totalCount: 2, nextCursor: "abc" };
    const b = { totalCount: 3, nextCursor: "abc" };

    expect(createT3TeamPollFingerprint(a)).not.toBe(createT3TeamPollFingerprint(b));
  });
});
