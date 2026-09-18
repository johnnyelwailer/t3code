import { describe, expect, it, vi } from "vite-plus/test";

type PostJsonCall = [string, string, object, { readonly timeoutMs?: number } | undefined];
const postJsonMock = vi.fn(async (..._args: PostJsonCall) => ({
  unchanged: true,
  fingerprint: "f",
  value: undefined,
}));
vi.mock("./t3team-t3BackendHttp", () => ({
  postJson: (...args: PostJsonCall) => postJsonMock(...args),
}));

import { createMyWorkDigestBackendApi } from "./t3team-myworkDigestBackendApi";

describe("createMyWorkDigestBackendApi", () => {
  it("gives the digest poll the extended cold-cache budget, not the 15s default", async () => {
    const api = createMyWorkDigestBackendApi("http://127.0.0.1:3773");
    await api.pollMyWorkDigest({
      scope: "all",
      projects: [],
      knownFingerprint: "previous",
    });

    expect(postJsonMock).toHaveBeenCalledTimes(1);
    const call = postJsonMock.mock.calls[0];
    expect(call).toBeDefined();
    const [baseUrl, path, body, options] = call!;
    expect(baseUrl).toBe("http://127.0.0.1:3773");
    expect(path).toBe("/api/t3team/mywork-digest/graph/poll");
    expect(body).toEqual({
      scope: "all",
      projects: [],
      poll: { enabled: true, knownFingerprint: "previous" },
    });
    expect(options).toEqual({ timeoutMs: 45_000 });
  });

  it("omits viewer and fingerprint when they are absent", async () => {
    const api = createMyWorkDigestBackendApi("http://127.0.0.1:3773");
    await api.pollMyWorkDigest({ scope: "project", projects: [] });

    expect(postJsonMock.mock.calls.at(-1)?.[2]).toEqual({
      scope: "project",
      projects: [],
      poll: { enabled: true },
    });
  });
});
