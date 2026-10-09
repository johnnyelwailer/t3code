import { describe, expect, it } from "vite-plus/test";

import { resolveBackendConnectionStatus } from "./t3team-BackendContext";

describe("resolveBackendConnectionStatus", () => {
  it("treats a live WS as connected so kickoff matches the thread composer", () => {
    expect(resolveBackendConnectionStatus("connected")).toBe("connected");
  });

  it("keeps connecting distinct from disconnected (kickoff must not say 'disconnected')", () => {
    expect(resolveBackendConnectionStatus("connecting")).toBe("connecting");
    expect(resolveBackendConnectionStatus("reconnecting")).toBe("connecting");
  });

  it("maps offline and error to non-connected statuses", () => {
    expect(resolveBackendConnectionStatus("offline")).toBe("disconnected");
    expect(resolveBackendConnectionStatus("error")).toBe("error");
  });
});
