/**
 * The description write — the apply side of a `description` draft.
 *
 * What these pin, because getting any of them wrong is silent damage rather than a visible error:
 *   • the payload is real ADF built from MARKDOWN, so a writer's headings and lists reach Jira as
 *     headings and lists instead of one flattened paragraph;
 *   • the editmeta gate runs first, exactly like the sibling scalar writes;
 *   • empty text is REFUSED, so applying an empty proposal cannot wipe a live description.
 */

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AtlassianIntegrationProvider } from "./provider.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const makeProvider = () =>
  new AtlassianIntegrationProvider({
    siteUrl: "https://test.atlassian.net",
    email: "user@example.com",
    apiToken: "token",
  });

const ACCOUNT = "https://test.atlassian.net";

interface AdfNodeShape {
  readonly type: string;
  readonly content?: ReadonlyArray<AdfNodeShape>;
}

describe("updateIssueDescription", () => {
  it("PUTs the description as an ADF document converted from markdown", async () => {
    let putBody: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { description: {} } });
      }
      if (url.endsWith("/rest/api/3/issue/PROJ-9")) {
        expect(init?.method).toBe("PUT");
        putBody = JSON.parse(String(init?.body));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await makeProvider().updateIssueDescription(
      ACCOUNT,
      "PROJ-9",
      "## Goal\n\nCheckout must round to two decimals.\n\n- Totals match the invoice\n- No rounding drift",
    );

    const description = (putBody as { readonly fields: { readonly description: AdfNodeShape } })
      .fields.description;
    expect(description.type).toBe("doc");
    // The structure is what proves markdown was CONVERTED, not stringified into one paragraph.
    expect(description.content?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
    ]);
  });

  it("refuses empty text instead of wiping the live description", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(
        `Must not reach Jira: ${typeof input === "string" ? input : input.toString()}`,
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      makeProvider().updateIssueDescription(ACCOUNT, "PROJ-9", "   \n  "),
    ).rejects.toThrow(/Refusing to write an empty description to PROJ-9/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails with the field-not-editable sentence when the edit screen omits Description", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { assignee: {} } });
      }
      throw new Error(
        `Description update must not reach Jira when editmeta rejects the field: ${url}`,
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      makeProvider().updateIssueDescription(ACCOUNT, "PROJ-9", "New description"),
    ).rejects.toThrow(/Description is not editable for PROJ-9/);
  });
});
