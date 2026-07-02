import { describe, expect, it } from "vite-plus/test";

import { createT3workPollFingerprint, toT3workPollResult } from "./t3work-integration-polling.ts";

describe("t3work integration polling", () => {
  it("produces a stable fingerprint for the same payload", () => {
    const payload = {
      items: [{ id: "one", title: "Issue 1" }],
      warning: "none",
    };

    expect(createT3workPollFingerprint(payload)).toBe(createT3workPollFingerprint(payload));
  });

  it("returns the payload when the client fingerprint is missing", () => {
    const payload = { items: [{ id: "one" }] };

    expect(
      toT3workPollResult(payload, {
        enabled: true,
      }),
    ).toEqual({
      unchanged: false,
      fingerprint: createT3workPollFingerprint(payload),
      value: payload,
    });
  });

  it("returns unchanged when the client fingerprint matches", () => {
    const payload = { items: [{ id: "one" }] };

    expect(
      toT3workPollResult(payload, {
        enabled: true,
        knownFingerprint: createT3workPollFingerprint(payload),
      }),
    ).toEqual({
      unchanged: true,
      fingerprint: createT3workPollFingerprint(payload),
    });
  });

  it("produces the same fingerprint regardless of object key insertion order", () => {
    const a = { totalCount: 2, nextCursor: "abc", items: [{ id: "one", title: "Issue 1" }] };
    const b = { nextCursor: "abc", items: [{ title: "Issue 1", id: "one" }], totalCount: 2 };

    expect(createT3workPollFingerprint(a)).toBe(createT3workPollFingerprint(b));
  });

  it("still produces different fingerprints for different data", () => {
    const a = { totalCount: 2, nextCursor: "abc" };
    const b = { totalCount: 3, nextCursor: "abc" };

    expect(createT3workPollFingerprint(a)).not.toBe(createT3workPollFingerprint(b));
  });
});
