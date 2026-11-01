import type { ThreadAnswersResolved } from "@t3tools/client-runtime/state/thread-answers";
import type { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import {
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { DESKTOP_ROUTE_ANSWER_TTL_MS } from "./t3team-desktopRouteClaims";
import {
  applyOwnDesktopRouteGrant,
  handleDesktopRouteAnswers,
} from "./t3team-desktopRouteObserver";

const proposal = { target: "npm.nexplore.ch", internal: false };
const id = encodeDesktopRouteQuestionId(proposal);
const NOW = 1_000_000_000_000;
const cloud = "env-cloud" as EnvironmentId;
const own = "env-own" as EnvironmentId;

const answered = (over: {
  readonly answer?: string;
  readonly question?: string;
  readonly ageMs?: number | null;
  readonly requestId?: string;
}) => ({
  requestId: (over.requestId ?? "req-1") as RuntimeRequestId,
  resolvedAtMs: over.ageMs === null ? null : NOW - (over.ageMs ?? 1_000),
  questions: [
    {
      id,
      header: DESKTOP_ROUTE_QUESTION_HEADER,
      question: over.question ?? desktopRouteQuestionLine(proposal),
      options: [],
    },
  ],
  answers: { [id]: over.answer ?? DESKTOP_ROUTE_ONCE_LABEL },
});

/** The same once-per-request-id contract as runDesktopRouteOnce, in memory. */
const makeOnce = (claimed: Set<string>) => async (id: string, work: () => Promise<boolean>) => {
  if (claimed.has(id)) return;
  if (await work()) claimed.add(id);
};

const makeDeps = (claimed: Set<string>, grantResult = true) => ({
  now: () => NOW,
  once: makeOnce(claimed),
  isClaimed: (id: string) => claimed.has(id),
  isOwnSubmit: (_id: string) => false,
  primaryEnvironmentId: () => own as EnvironmentId | null,
  sessions: vi.fn(async () => [{ sessionId: "4242", environmentId: cloud }]),
  grant: vi.fn(async () => grantResult),
  notify: vi.fn(),
});

const run = async (
  event: Partial<Pick<ThreadAnswersResolved, "live" | "missed" | "environmentId">>,
  overrides: { readonly claimed?: Set<string>; readonly grantResult?: boolean } = {},
) => {
  const deps = makeDeps(overrides.claimed ?? new Set<string>(), overrides.grantResult);
  await handleDesktopRouteAnswers(
    { environmentId: cloud, threadId: "t" as ThreadId, live: [], missed: [], ...event },
    deps,
  );
  return deps;
};

describe("handleDesktopRouteAnswers", () => {
  it("grants a live answer made on another device, for the thread's own session", async () => {
    const deps = await run({ live: [answered({})] });
    expect(deps.grant).toHaveBeenCalledWith({
      session: "4242",
      target: "npm.nexplore.ch",
      scope: "once",
      allowPrivate: false,
    });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("grants once: a second delivery of the same request id is ignored", async () => {
    const claimed = new Set<string>();
    await run({ live: [answered({})] }, { claimed });
    const again = await run({ live: [answered({})] }, { claimed });
    expect(again.grant).not.toHaveBeenCalled();
    expect(again.notify).not.toHaveBeenCalled();
  });

  it("never grants an answer already given when first seen (a replay), only says so", async () => {
    const deps = await run({ missed: [answered({ ageMs: 60_000 })] });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Desktop route request expired" }),
    );
  });

  it("stays silent about an old replay, a decline or a request this client already claimed", async () => {
    expect(
      (await run({ missed: [answered({ ageMs: 2 * 60 * 60_000 })] })).notify,
    ).not.toHaveBeenCalled();
    expect(
      (await run({ missed: [answered({ answer: DESKTOP_ROUTE_DECLINE_LABEL })] })).notify,
    ).not.toHaveBeenCalled();
    const claimed = new Set(["req-1"]);
    expect((await run({ missed: [answered({})] }, { claimed })).notify).not.toHaveBeenCalled();
  });

  it("does not grant a live answer older than the TTL: a notice instead", async () => {
    const deps = await run({ live: [answered({ ageMs: DESKTOP_ROUTE_ANSWER_TTL_MS + 1 })] });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledOnce();
  });

  it("treats an answer without a resolution time as expired", async () => {
    const deps = await run({ live: [answered({ ageMs: null })] });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledOnce();
  });

  it("does nothing for a thread on this computer's own environment", async () => {
    const deps = await run({ environmentId: own, live: [answered({})] });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.sessions).not.toHaveBeenCalled();
  });

  it("does not grant when the card did not show what it grants", async () => {
    const deps = await run({ live: [answered({ question: "Reach somewhere else?" })] });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("grants nothing for a decline", async () => {
    const deps = await run({ live: [answered({ answer: DESKTOP_ROUTE_DECLINE_LABEL })] });
    expect(deps.grant).not.toHaveBeenCalled();
  });

  it("says so, and grants nothing, when the session list cannot be read", async () => {
    const deps = makeDeps(new Set());
    deps.sessions.mockRejectedValue(new Error("list failed"));
    await handleDesktopRouteAnswers(
      { environmentId: cloud, threadId: "t" as ThreadId, live: [answered({})], missed: [] },
      deps,
    );
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Desktop route not set up" }),
    );
  });

  it("treats an answer dated in the future (clock skew) as fresh, not as an error", async () => {
    const deps = await run({ live: [answered({ ageMs: -5 * 60_000 })] });
    expect(deps.grant).toHaveBeenCalledOnce();
  });

  it("a failed grant is not claimed, so the submitting client can still make it", async () => {
    const claimed = new Set<string>();
    const failing = await run({ live: [answered({})] }, { claimed, grantResult: false });
    expect(failing.grant).toHaveBeenCalledOnce();
    expect(claimed.has("req-1")).toBe(false);
    const own = makeDeps(claimed);
    await applyOwnDesktopRouteGrant(
      "req-1",
      { session: "4242", target: "npm.nexplore.ch", scope: "once", allowPrivate: false },
      own,
    );
    expect(own.grant).toHaveBeenCalledOnce();
  });

  it("the submitting client and the observer share one claim: one answer grants once", async () => {
    const claimed = new Set<string>();
    const deps = makeDeps(claimed);
    await applyOwnDesktopRouteGrant(
      "req-1",
      { session: "4242", target: "npm.nexplore.ch", scope: "once", allowPrivate: false },
      deps,
    );
    await handleDesktopRouteAnswers(
      { environmentId: cloud, threadId: "t" as ThreadId, live: [answered({})], missed: [] },
      deps,
    );
    expect(deps.grant).toHaveBeenCalledOnce();
  });

  it("never applies an internal route answered elsewhere: a notice, no grant, no private range", async () => {
    const internalProposal = { target: "npm.nexplore.ch", internal: true };
    const internalId = encodeDesktopRouteQuestionId(internalProposal);
    const claimed = new Set<string>();
    const deps = await run(
      {
        live: [
          {
            requestId: "req-int" as RuntimeRequestId,
            resolvedAtMs: NOW - 1_000,
            questions: [
              {
                id: internalId,
                header: DESKTOP_ROUTE_QUESTION_HEADER,
                question: desktopRouteQuestionLine(internalProposal),
                options: [],
              },
            ],
            answers: { [internalId]: DESKTOP_ROUTE_ONCE_LABEL },
          },
        ],
      },
      { claimed },
    );
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Internal routes are approved on this computer" }),
    );
    expect(claimed.has("req-int")).toBe(true);
  });

  it("treats a private address as internal even when the id says it is not", async () => {
    const lying = { target: "10.9.9.9", internal: false };
    const lyingId = encodeDesktopRouteQuestionId(lying);
    const deps = await run({
      live: [
        {
          requestId: "req-lie" as RuntimeRequestId,
          resolvedAtMs: NOW - 1_000,
          questions: [
            {
              id: lyingId,
              header: DESKTOP_ROUTE_QUESTION_HEADER,
              question: desktopRouteQuestionLine(lying),
              options: [],
            },
          ],
          answers: { [lyingId]: DESKTOP_ROUTE_ONCE_LABEL },
        },
      ],
    });
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledOnce();
  });

  it("leaves an answer this client's own card is submitting to its own path: no grant, no notice", async () => {
    const deps = makeDeps(new Set());
    deps.isOwnSubmit = (id: string) => id === "req-1";
    await handleDesktopRouteAnswers(
      { environmentId: cloud, threadId: "t" as ThreadId, live: [answered({})], missed: [] },
      deps,
    );
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });
});
