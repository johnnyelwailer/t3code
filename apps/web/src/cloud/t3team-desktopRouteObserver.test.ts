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
import { handleDesktopRouteAnswers } from "./t3team-desktopRouteObserver";

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

const run = async (
  event: Partial<Pick<ThreadAnswersResolved, "live" | "missed" | "environmentId">>,
  overrides: { readonly claimed?: Set<string> } = {},
) => {
  const claimed = overrides.claimed ?? new Set<string>();
  const deps = {
    now: () => NOW,
    claim: (requestId: string) => !claimed.has(requestId) && (claimed.add(requestId), true),
    primaryEnvironmentId: () => own,
    sessions: vi.fn(async () => [{ sessionId: "4242", environmentId: cloud }]),
    grant: vi.fn(async () => {}),
    notify: vi.fn(),
  };
  await handleDesktopRouteAnswers(
    {
      environmentId: cloud,
      threadId: "t" as ThreadId,
      live: [],
      missed: [],
      ...event,
    },
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

  it("says so, and grants nothing, when the thread's session is not among the user's sessions", async () => {
    const claimed = new Set<string>();
    const deps = {
      now: () => NOW,
      claim: (requestId: string) => !claimed.has(requestId) && (claimed.add(requestId), true),
      primaryEnvironmentId: () => own,
      sessions: async () => {
        throw new Error("list failed");
      },
      grant: vi.fn(async () => {}),
      notify: vi.fn(),
    };
    await handleDesktopRouteAnswers(
      { environmentId: cloud, threadId: "t" as ThreadId, live: [answered({})], missed: [] },
      deps,
    );
    expect(deps.grant).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Desktop route not set up" }),
    );
  });
});
