import { assert, it } from "@effect/vitest";

import {
  metadataRefreshThrottleMs,
  shouldAttemptMetadataRefresh,
} from "./t3team-atlassian-backlog-metadataRefresh.ts";

it("allows a first attempt when there is no prior attempt recorded", () => {
  assert.isTrue(shouldAttemptMetadataRefresh(undefined, 1_000));
});

it("skips an attempt within the throttle window", () => {
  const lastAttemptMs = 1_000;
  const nowMs = lastAttemptMs + metadataRefreshThrottleMs - 1;
  assert.isFalse(shouldAttemptMetadataRefresh(lastAttemptMs, nowMs));
});

it("allows an attempt once the throttle window has elapsed", () => {
  const lastAttemptMs = 1_000;
  const nowMs = lastAttemptMs + metadataRefreshThrottleMs;
  assert.isTrue(shouldAttemptMetadataRefresh(lastAttemptMs, nowMs));
});
