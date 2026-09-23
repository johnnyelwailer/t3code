import { describe, expect, it } from "vite-plus/test";

import { humanizeT3TeamBackendError } from "./t3team-humanizeBackendError";

describe("humanizeT3TeamBackendError", () => {
  it("turns a transport failure into a reachability sentence and keeps the raw text", () => {
    const raw =
      "Failed to reach backend /api/t3team/atlassian/my-work/poll at http://localhost:6703. Fetch error: Failed to fetch";
    const result = humanizeT3TeamBackendError(raw);
    expect(result.title).toContain("not reachable");
    expect(result.detail).toBe(raw);
  });

  it("treats a backend timeout as 'still working', not 'server down'", () => {
    const raw =
      "Failed to reach backend /api/t3team/mywork-digest/graph/poll at http://127.0.0.1:3773. Fetch error: Backend request timed out after 15000ms.";
    const result = humanizeT3TeamBackendError(raw);
    expect(result.title).toContain("still working");
    expect(result.title).not.toContain("not reachable");
    expect(result.detail).toBe(raw);
  });

  it("recognises an expired Jira session", () => {
    const result = humanizeT3TeamBackendError(
      'Token refresh failed (403): {"error":"unauthorized_client","error_description":"refresh_token is invalid"}',
    );
    expect(result.title).toContain("Jira session has expired");
  });

  it("recognises a server database that is behind the app", () => {
    expect(humanizeT3TeamBackendError("Failed to prepare statement").title).toContain(
      "database is out of date",
    );
  });

  it("passes unknown messages through unchanged and has a fallback for empty ones", () => {
    expect(humanizeT3TeamBackendError("Something odd")).toEqual({ title: "Something odd" });
    expect(humanizeT3TeamBackendError(undefined).title).toBe("Something went wrong while loading.");
  });
});
