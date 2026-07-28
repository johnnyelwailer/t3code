/**
 * Recording a draft's verdict durably, so a reload cannot re-offer an accepted rewrite.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  recordDraftCarrierOutcome,
  T3TEAM_DRAFT_STATUS_PATH,
} from "~/t3team/workitem/t3team-recordDraftCarrierOutcome";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";

const DRAFT = {
  id: "jira-draft:message-9",
  sourceThreadId: "thread-1",
  field: "description",
  target: { issueIdOrKey: "NXAI-6" },
} as unknown as T3TeamDraftMutation;

const BACKEND = { httpBaseUrl: "http://localhost:13784" } as unknown as BackendApi;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordDraftCarrierOutcome", () => {
  it("posts the thread, draft and verdict to the status route", async () => {
    await recordDraftCarrierOutcome({ backend: BACKEND, draft: DRAFT, outcome: "applied" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:13784${T3TEAM_DRAFT_STATUS_PATH}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      threadId: "thread-1",
      draftId: "jira-draft:message-9",
      status: "applied",
    });
  });

  it("records a dismissal with the same shape", async () => {
    await recordDraftCarrierOutcome({ backend: BACKEND, draft: DRAFT, outcome: "dismissed" });

    expect(JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).status).toBe(
      "dismissed",
    );
  });

  /** A write that landed in Jira but was not recorded is the state that produces a duplicate write. */
  it("surfaces the route's own sentence when it refuses", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "No draft carrier 'message-9' on thread thread-1." }),
    });

    await expect(
      recordDraftCarrierOutcome({ backend: BACKEND, draft: DRAFT, outcome: "applied" }),
    ).rejects.toThrow("No draft carrier");
  });

  it("falls back to a readable message when the body is not JSON", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(
      recordDraftCarrierOutcome({ backend: BACKEND, draft: DRAFT, outcome: "applied" }),
    ).rejects.toThrow("500");
  });

  it("does nothing without a server or a proposing thread", async () => {
    await recordDraftCarrierOutcome({ backend: null, draft: DRAFT, outcome: "applied" });
    const { sourceThreadId: _dropped, ...withoutThread } = DRAFT as Record<string, unknown>;
    await recordDraftCarrierOutcome({
      backend: BACKEND,
      draft: withoutThread as unknown as T3TeamDraftMutation,
      outcome: "applied",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
