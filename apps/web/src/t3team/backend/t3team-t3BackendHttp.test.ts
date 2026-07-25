import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { postJson } from "./t3team-t3BackendHttp";

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
      postJson("http://127.0.0.1:13773/", "/api/t3team/project/workspace/context-files", {
        workspaceRoot: "/tmp/project-alpha",
        files: [],
      }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).toString()).toBe(
      "http://127.0.0.1:13773/api/t3team/project/workspace/context-files",
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
      signal: expect.any(AbortSignal),
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
      postJson("http://127.0.0.1:13773/", "/api/t3team/atlassian/accounts", {}),
    ).rejects.toThrow(
      "Failed to reach backend /api/t3team/atlassian/accounts at http://127.0.0.1:13773. Fetch error: Failed to fetch. Browser origin: http://127.0.0.1:5733. This is a cross-origin browser request. If the backend is running, a CORS mismatch or blocked preflight likely prevented the request from reaching the route.",
    );
  });

  it("times out hung backend requests instead of waiting forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );

    const request = expect(
      postJson("http://127.0.0.1:13773/", "/api/t3team/atlassian/backlog", {}),
    ).rejects.toThrow(
      "Failed to reach backend /api/t3team/atlassian/backlog at http://127.0.0.1:13773. Fetch error: Backend request timed out after 15000ms.",
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await request;
  });
});
