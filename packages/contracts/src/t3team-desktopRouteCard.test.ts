import { describe, expect, it } from "vite-plus/test";

import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "./t3team-desktopRoute.ts";
import { desktopRouteCardFrom, desktopRouteCardOf } from "./t3team-desktopRouteCard.ts";

const options = [
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_SESSION_LABEL,
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
].map((label) => ({ label }));

const question = (proposal: { target: string; internal: boolean }, over = {}) => ({
  id: encodeDesktopRouteQuestionId(proposal),
  header: DESKTOP_ROUTE_QUESTION_HEADER,
  question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: npm ci times out \\(registry\\) behind the proxy.\n\nOnly this host is routed.`,
  options,
  ...over,
});

describe("desktopRouteCardFrom", () => {
  it("shows the host, the reason as plain text and the three actions plus Always for a public host", () => {
    expect(
      desktopRouteCardFrom(question({ target: "registry.npmjs.org", internal: false })),
    ).toEqual({
      target: "registry.npmjs.org",
      internal: false,
      reason: "npm ci times out (registry) behind the proxy.",
      actions: {
        once: DESKTOP_ROUTE_ONCE_LABEL,
        session: DESKTOP_ROUTE_SESSION_LABEL,
        always: DESKTOP_ROUTE_ALWAYS_LABEL,
        decline: DESKTOP_ROUTE_DECLINE_LABEL,
      },
    });
  });

  it("carries nothing about the session: the app names it from the thread's environment", () => {
    const card = desktopRouteCardFrom(question({ target: "registry.npmjs.org", internal: false }));
    expect(Object.keys(card ?? {}).sort()).toEqual(["actions", "internal", "reason", "target"]);
  });

  it("marks an internal host and never offers Always, whatever the options carry", () => {
    const flagged = desktopRouteCardFrom(question({ target: "npm.nexplore.ch", internal: true }));
    expect(flagged).toMatchObject({ internal: true, actions: { always: null } });
    // The agent says public; the address says private.
    const lied = desktopRouteCardFrom(question({ target: "192.168.0.7", internal: false }));
    expect(lied).toMatchObject({ internal: true, actions: { always: null } });
  });

  it("is null for another question, a card that does not show its id, or a multi-select", () => {
    const p = { target: "registry.npmjs.org", internal: false };
    expect(desktopRouteCardFrom(question(p, { id: "other" }))).toBeNull();
    expect(desktopRouteCardFrom(question(p, { question: "Reach evil.example?" }))).toBeNull();
    expect(desktopRouteCardFrom(question(p, { header: "Other" }))).toBeNull();
    expect(desktopRouteCardFrom(question(p, { multiSelect: true }))).toBeNull();
  });

  it("offers only the answers the question has", () => {
    const p = { target: "registry.npmjs.org", internal: false };
    const card = desktopRouteCardFrom(
      question(p, { options: [{ label: DESKTOP_ROUTE_DECLINE_LABEL }] }),
    );
    expect(card?.actions).toEqual({
      once: null,
      session: null,
      always: null,
      decline: DESKTOP_ROUTE_DECLINE_LABEL,
    });
  });

  it("is a card only for a request that is exactly one desktop-route question", () => {
    const q = question({ target: "registry.npmjs.org", internal: false });
    expect(desktopRouteCardOf([q])).not.toBeNull();
    expect(desktopRouteCardOf([q, q])).toBeNull();
    expect(desktopRouteCardOf([])).toBeNull();
    expect(desktopRouteCardOf([{ ...q, id: "other" }])).toBeNull();
  });
});
