import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAtlassianPollingBackendApi,
  createGitHubPollingBackendApi,
} from "./t3work-pollingBackend";

describe("t3work polling backend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts GitHub polling requests to the poll route with the known fingerprint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:13775/api/t3work/github/inbox/poll");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        host: "github.com",
        projectKey: "ABC",
        linkedRepositoryUrls: ["https://github.com/acme/repo"],
        poll: {
          enabled: true,
          knownFingerprint: "sha256:known",
        },
      });

      return new Response(JSON.stringify({ unchanged: true, fingerprint: "sha256:known" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const api = createGitHubPollingBackendApi("http://localhost:13775/");
    const result = await api.pollInbox({
      host: "github.com",
      projectKey: "ABC",
      linkedRepositoryUrls: ["https://github.com/acme/repo"],
      knownFingerprint: "sha256:known",
    });

    expect(result).toEqual({ unchanged: true, fingerprint: "sha256:known" });
  });

  it("posts Atlassian polling requests with an enabled poll envelope", async () => {
    const page = { items: [{ id: "ticket-1" }], nextCursor: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:13775/api/t3work/atlassian/resources/poll");
      expect(JSON.parse(String(init?.body))).toEqual({
        account: { id: "acct-1", provider: "atlassian" },
        externalProjectId: "PROJ",
        poll: { enabled: true },
      });

      return new Response(
        JSON.stringify({ unchanged: false, fingerprint: "sha256:new", value: page }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const api = createAtlassianPollingBackendApi("http://localhost:13775/");
    const result = await api.pollResources({
      account: { id: "acct-1", provider: "atlassian" },
      externalProjectId: "PROJ",
    });

    expect(result).toEqual({ unchanged: false, fingerprint: "sha256:new", value: page });
  });
});
