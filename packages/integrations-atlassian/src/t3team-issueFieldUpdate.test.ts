/** Request bodies for the allowlisted labels / priority / fix-version write, and its refusals. */

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AtlassianIntegrationProvider } from "./provider.ts";
import { buildIssueFieldUpdateBody } from "./t3team-issueFieldUpdate.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const ACCOUNT = "https://test.atlassian.net";
const makeProvider = () =>
  new AtlassianIntegrationProvider({
    siteUrl: ACCOUNT,
    email: "user@example.com",
    apiToken: "token",
  });

function mockJira(editable: ReadonlyArray<string>) {
  const puts: unknown[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/issue/PROJ-9/editmeta")) {
      return Response.json({ fields: Object.fromEntries(editable.map((id) => [id, {}])) });
    }
    if (url.endsWith("/issue/PROJ-9")) {
      expect(init?.method).toBe("PUT");
      puts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { puts, fetchMock };
}

describe("buildIssueFieldUpdateBody", () => {
  it("builds exact add/remove ops and a priority name", () => {
    expect(
      buildIssueFieldUpdateBody({
        labels: { add: ["bug", " bug ", "ui"], remove: ["wontfix"] },
        priority: " High ",
        fixVersions: { add: ["2.4.0"], remove: ["2.3.0"] },
      }),
    ).toEqual({
      fields: { priority: { name: "High" } },
      update: {
        labels: [{ add: "bug" }, { add: "ui" }, { remove: "wontfix" }],
        fixVersions: [{ add: { name: "2.4.0" } }, { remove: { name: "2.3.0" } }],
      },
    });
  });

  it.each([
    ["an empty update", {}],
    ["empty lists", { labels: { add: [], remove: [" "] } }],
    ["a blank priority", { priority: "  " }],
    ["adding and removing one label", { labels: { add: ["a"], remove: ["a"] } }],
    ["a label with a space", { labels: { add: ["two words"] } }],
  ])("refuses %s", (_name, update) => {
    expect(() => buildIssueFieldUpdateBody(update)).toThrow();
  });
});

it("has no way to name another field: the type refuses it and nothing is sent", () => {
  // @ts-expect-error `assignee` is not in the allowlist, so the update type rejects it.
  expect(() => buildIssueFieldUpdateBody({ assignee: "x" })).toThrow(/changes nothing/);
});

describe("updateIssueFields", () => {
  it("PUTs one body after gating every touched field on the edit screen", async () => {
    const { puts, fetchMock } = mockJira(["labels", "priority", "fixVersions"]);
    await makeProvider().updateIssueFields(ACCOUNT, "PROJ-9", {
      labels: { add: ["bug"] },
      priority: "High",
      fixVersions: { add: ["2.4.0"] },
    });
    expect(puts).toEqual([
      {
        fields: { priority: { name: "High" } },
        update: { labels: [{ add: "bug" }], fixVersions: [{ add: { name: "2.4.0" } }] },
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url).split("/issue/")[1])).toEqual([
      "PROJ-9/editmeta",
      "PROJ-9/editmeta",
      "PROJ-9/editmeta",
      "PROJ-9",
    ]);
  });

  it("does not write when a touched field is off the edit screen", async () => {
    const { puts } = mockJira(["labels"]);
    await expect(
      makeProvider().updateIssueFields(ACCOUNT, "PROJ-9", {
        labels: { add: ["bug"] },
        priority: "High",
      }),
    ).rejects.toThrow(/Priority is not editable for PROJ-9/);
    expect(puts).toEqual([]);
  });

  it("refuses an empty update before any request", async () => {
    const { fetchMock } = mockJira([]);
    await expect(makeProvider().updateIssueFields(ACCOUNT, "PROJ-9", {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
