import { describe, expect, it } from "@effect/vitest";

import {
  APPLICATION_ACTIVE_MIN_HIDDEN_MS,
  isApplicationActiveResubscribeWake,
} from "./t3team-applicationActiveWake.ts";

describe("application-active resubscribe gate", () => {
  it("never fires when the document was never observed hidden", () => {
    // First paint of a window that started in the background: no prior
    // hidden interval to gate on, and the connection is still cold.
    expect(isApplicationActiveResubscribeWake(null, 100_000)).toBe(false);
  });

  it("suppresses the wake for a brief blur/refocus below the minimum hidden span", () => {
    expect(
      isApplicationActiveResubscribeWake(100_000, 100_000 + APPLICATION_ACTIVE_MIN_HIDDEN_MS - 1),
    ).toBe(false);
  });

  it("fires the wake once the hidden span reaches the minimum", () => {
    expect(
      isApplicationActiveResubscribeWake(100_000, 100_000 + APPLICATION_ACTIVE_MIN_HIDDEN_MS),
    ).toBe(true);
  });

  it("fires the wake for a long backgrounding such as system sleep", () => {
    expect(isApplicationActiveResubscribeWake(100_000, 100_000 + 10 * 60_000)).toBe(true);
  });

  it("honors a caller-supplied minimum hidden span", () => {
    expect(isApplicationActiveResubscribeWake(100_000, 101_005, 1_000)).toBe(true);
    expect(isApplicationActiveResubscribeWake(100_000, 101_005, 6_000)).toBe(false);
  });
});
