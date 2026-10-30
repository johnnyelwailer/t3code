import type { EnvironmentId } from "@t3tools/contracts";
import {
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { captureDesktopRouteApply } from "./t3team-desktopRouteCapture";

const proposal = { target: "npm.nexplore.ch", internal: true };
const id = encodeDesktopRouteQuestionId(proposal);
const questions = [
  { id, header: DESKTOP_ROUTE_QUESTION_HEADER, question: desktopRouteQuestionLine(proposal) },
];
const cloud = "env-cloud" as EnvironmentId;
const own = "env-own" as EnvironmentId;
const base = { questions, threadEnvironmentId: cloud, primaryEnvironmentId: own };

describe("captureDesktopRouteApply", () => {
  it("names the session of the thread's own environment, not one the question supplies", () => {
    const sessions = [
      { sessionId: "111", environmentId: "env-other" },
      { sessionId: "4242", environmentId: "env-cloud" },
    ];
    expect(
      captureDesktopRouteApply({
        ...base,
        answers: { [id]: DESKTOP_ROUTE_SESSION_LABEL },
        sessions,
      }),
    ).toEqual({
      grant: { session: "4242", target: "npm.nexplore.ch", scope: "session", allowPrivate: true },
    });
  });

  it("is null for a decline or an answer that is not a desktop-route proposal", () => {
    const sessions = [{ sessionId: "4242", environmentId: "env-cloud" }];
    expect(
      captureDesktopRouteApply({
        ...base,
        answers: { [id]: DESKTOP_ROUTE_DECLINE_LABEL },
        sessions,
      }),
    ).toBeNull();
    expect(
      captureDesktopRouteApply({
        ...base,
        questions: [{ id: "x", question: "y" }],
        answers: { x: "ok" },
        sessions,
      }),
    ).toBeNull();
  });

  it("grants nothing, and says why, when the session is unknown, ambiguous, or the thread is local", () => {
    const answers = { [id]: DESKTOP_ROUTE_SESSION_LABEL };
    expect(captureDesktopRouteApply({ ...base, answers, sessions: [] })).toMatchObject({
      grant: null,
    });
    expect(
      captureDesktopRouteApply({
        ...base,
        answers,
        sessions: [
          { sessionId: "1", environmentId: "env-cloud" },
          { sessionId: "2", environmentId: "env-cloud" },
        ],
      }),
    ).toMatchObject({ grant: null });
    expect(
      captureDesktopRouteApply({
        ...base,
        threadEnvironmentId: own,
        answers,
        sessions: [{ sessionId: "1", environmentId: "env-own" }],
      }),
    ).toMatchObject({ grant: null });
  });
});
