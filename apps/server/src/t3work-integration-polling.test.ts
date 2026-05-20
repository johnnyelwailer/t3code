import { describe, expect, it } from "vitest";

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
});
