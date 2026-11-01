import * as Base64Url from "effect/encoding/Base64Url";
import { describe, expect, it } from "vite-plus/test";

import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_QUESTION_PREFIX,
  DESKTOP_ROUTE_SESSION_LABEL,
  decodeDesktopRouteQuestionId,
  desktopRouteAcceptedFrom,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
  isDesktopRouteQuestionIdPrefixed,
} from "./t3team-desktopRoute.ts";

const proposal = { target: "npm.nexplore.ch", internal: true };
const question = (overrides: Record<string, unknown> = {}) => ({
  id: encodeDesktopRouteQuestionId(proposal),
  header: DESKTOP_ROUTE_QUESTION_HEADER,
  question: `${desktopRouteQuestionLine(proposal)}\n\nReason the agent gave: install packages.`,
  ...overrides,
});
const answerOf = (label: string, q = question()) => ({ [q.id]: label });

describe("desktop route question", () => {
  it("matches the namespace by prefix, case-insensitively, whatever follows", () => {
    for (const id of [
      DESKTOP_ROUTE_QUESTION_PREFIX,
      `${DESKTOP_ROUTE_QUESTION_PREFIX}!!`,
      DESKTOP_ROUTE_QUESTION_PREFIX.toUpperCase(),
      encodeDesktopRouteQuestionId({ target: "ｅｘａｍｐｌｅ.com", internal: true }),
    ]) {
      expect(isDesktopRouteQuestionIdPrefixed(id)).toBe(true);
    }
    expect(isDesktopRouteQuestionIdPrefixed("size")).toBe(false);
    expect(isDesktopRouteQuestionIdPrefixed(` ${DESKTOP_ROUTE_QUESTION_PREFIX}`)).toBe(false);
  });

  it("round-trips a proposal through the question id", () => {
    expect(decodeDesktopRouteQuestionId(encodeDesktopRouteQuestionId(proposal))).toEqual(proposal);
  });

  it("maps each approving answer to its scope", () => {
    for (const [label, scope] of [
      [DESKTOP_ROUTE_ONCE_LABEL, "once"],
      [DESKTOP_ROUTE_SESSION_LABEL, "session"],
      [DESKTOP_ROUTE_ALWAYS_LABEL, "always"],
    ] as const) {
      expect(desktopRouteAcceptedFrom([question()], answerOf(label))).toEqual(
        label === DESKTOP_ROUTE_ALWAYS_LABEL ? null : { ...proposal, scope },
      );
    }
  });

  it("applies nothing for a decline, other text or a multiple-choice shape", () => {
    expect(
      desktopRouteAcceptedFrom([question()], answerOf(DESKTOP_ROUTE_DECLINE_LABEL)),
    ).toBeNull();
    expect(desktopRouteAcceptedFrom([question()], answerOf("sure"))).toBeNull();
    expect(
      desktopRouteAcceptedFrom(
        [question({ multiSelect: true })],
        answerOf(DESKTOP_ROUTE_SESSION_LABEL),
      ),
    ).toBeNull();
    expect(desktopRouteAcceptedFrom([question()], {})).toBeNull();
  });

  it("never applies 'Always' for an internal host, however the agent flagged it", () => {
    for (const target of ["10.0.0.5", "intranet", "registry.corp.local"]) {
      const p = { target, internal: false };
      const q = {
        id: encodeDesktopRouteQuestionId(p),
        header: DESKTOP_ROUTE_QUESTION_HEADER,
        question: desktopRouteQuestionLine(p),
      };
      expect(desktopRouteAcceptedFrom([q], { [q.id]: DESKTOP_ROUTE_ALWAYS_LABEL })).toBeNull();
      expect(desktopRouteAcceptedFrom([q], { [q.id]: DESKTOP_ROUTE_SESSION_LABEL })).not.toBeNull();
    }
    expect(desktopRouteAcceptedFrom([question()], answerOf(DESKTOP_ROUTE_ALWAYS_LABEL))).toBeNull();
    const pub = { target: "registry.npmjs.org", internal: false };
    const q = {
      id: encodeDesktopRouteQuestionId(pub),
      header: DESKTOP_ROUTE_QUESTION_HEADER,
      question: desktopRouteQuestionLine(pub),
    };
    expect(desktopRouteAcceptedFrom([q], { [q.id]: DESKTOP_ROUTE_ALWAYS_LABEL })).toEqual({
      ...pub,
      scope: "always",
    });
  });

  it("applies only a card that shows what it would grant", () => {
    const other = encodeDesktopRouteQuestionId({ target: "evil.example", internal: false });
    // The id says evil.example, the card text says npm.nexplore.ch.
    expect(
      desktopRouteAcceptedFrom([question({ id: other })], { [other]: DESKTOP_ROUTE_SESSION_LABEL }),
    ).toBeNull();
    expect(
      desktopRouteAcceptedFrom(
        [question({ header: "Something else" })],
        answerOf(DESKTOP_ROUTE_SESSION_LABEL),
      ),
    ).toBeNull();
    expect(
      desktopRouteAcceptedFrom(
        [question({ question: "Allow it?" })],
        answerOf(DESKTOP_ROUTE_SESSION_LABEL),
      ),
    ).toBeNull();
  });

  it("states an internal address in the first line, and not otherwise", () => {
    expect(desktopRouteQuestionLine(proposal)).toContain("private network address");
    expect(desktopRouteQuestionLine({ target: "github.com", internal: false })).not.toContain(
      "private",
    );
  });

  it("refuses ids that are malformed or carry a target that is not one plain token", () => {
    for (const target of [
      "*.nexplore.ch",
      "a b",
      "user@host",
      "host‮evil",
      "x".repeat(301),
      "",
      "a\\b",
      "a\u0000b",
    ]) {
      const id = `desktop-route:v1:${Base64Url.encode(JSON.stringify({ target, internal: false }))}`;
      expect(decodeDesktopRouteQuestionId(id), JSON.stringify(target)).toBeNull();
    }
    for (const id of [
      "desktop-route:v1:",
      "desktop-route:v1:!!!",
      "machine-source:v1:abc",
      "desktop-route:v1:" + Base64Url.encode("not json"),
    ]) {
      expect(decodeDesktopRouteQuestionId(id)).toBeNull();
    }
  });

  it("escapes markdown in the target so the card shows it as text", () => {
    expect(
      desktopRouteQuestionLine({ target: "https://x.example/[a](b)", internal: false }),
    ).not.toMatch(/\]\(b\)/);
  });
});
