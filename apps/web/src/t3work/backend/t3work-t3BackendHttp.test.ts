import { afterEach, describe, expect, it, vi } from "vitest";

import { postJson } from "./t3work-t3BackendHttp";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postJson", () => {
  it("includes browser credentials on backend POST requests", async () => {
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
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceRoot: "/tmp/project-alpha",
        files: [],
      }),
    });
  });
});
