import { afterEach, describe, expect, it, vi } from "vitest";

import { postJson } from "./t3work-t3BackendHttp";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postJson", () => {
  it("uses same-origin credentials on backend POST requests", async () => {
    const response = {
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postJson("http://127.0.0.1:13773/", "/api/t3work/project/workspace/context-files", {
        workspaceRoot: "/tmp/project-alpha",
        files: [],
      }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).toString()).toBe(
      "http://127.0.0.1:13773/api/t3work/project/workspace/context-files",
    );
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceRoot: "/tmp/project-alpha",
        files: [],
      }),
    });
  });

  it("surfaces route and origin details when the browser fails before a response arrives", async () => {
    vi.stubGlobal("location", {
      origin: "http://127.0.0.1:5733",
    } satisfies Pick<Location, "origin">);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      postJson("http://127.0.0.1:13773/", "/api/t3work/atlassian/accounts", {}),
    ).rejects.toThrow(
      "Failed to reach backend /api/t3work/atlassian/accounts at http://127.0.0.1:13773. Fetch error: Failed to fetch. Browser origin: http://127.0.0.1:5733. This is a cross-origin browser request. If the backend is running, a CORS mismatch or blocked preflight likely prevented the request from reaching the route.",
    );
  });
});
