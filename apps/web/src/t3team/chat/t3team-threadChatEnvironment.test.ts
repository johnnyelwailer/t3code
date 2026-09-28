import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadChatEnvironmentId } from "~/t3team/chat/t3team-threadChatEnvironment";

const PRIMARY = EnvironmentId.make("primary-env");
const CLOUD = EnvironmentId.make("5291a715-cca8-47f1-91c4-e0a556891d47");

describe("resolveThreadChatEnvironmentId", () => {
  it("runs a thread on the environment that owns its project, not the primary", () => {
    // A cloud session's project lives on that machine; sending its thread to
    // the primary server fails with "Project … does not exist" (2026-09-28 E2E).
    expect(resolveThreadChatEnvironmentId({ environmentId: CLOUD }, PRIMARY)).toBe(CLOUD);
  });

  it("falls back to the primary only while the project is not known yet", () => {
    expect(resolveThreadChatEnvironmentId(null, PRIMARY)).toBe(PRIMARY);
    expect(resolveThreadChatEnvironmentId(undefined, null)).toBeNull();
  });
});
