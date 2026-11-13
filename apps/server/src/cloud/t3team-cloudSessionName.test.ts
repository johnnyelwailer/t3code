import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  isAppStartedSessionRun,
  makeSessionTag,
  sessionNameFromRunName,
} from "./t3team-cloudSessionName.ts";

const runName = (tag: string) => `nexi-session [${tag}] · broker · machine`;

describe("session names", () => {
  it.effect("round-trips a project machine's repository name through the run name", () =>
    Effect.gen(function* () {
      const tag = yield* makeSessionTag("nexi-machine-qa");
      expect(tag).toMatch(/^nexi-machine-qa\.s[0-9a-z]+$/);
      expect(sessionNameFromRunName(runName(tag))).toBe("nexi-machine-qa");
    }),
  );

  it.effect("leaves a plain session, and a run from before names, unnamed", () =>
    Effect.gen(function* () {
      const tag = yield* makeSessionTag(null);
      expect(tag).toMatch(/^s[0-9a-z]+$/);
      expect(sessionNameFromRunName(runName(tag))).toBeUndefined();
      expect(sessionNameFromRunName("nexi-session · broker")).toBeUndefined();
    }),
  );

  it.effect("keeps a repository name with dots or brackets inside the tag", () =>
    Effect.gen(function* () {
      const tag = yield* makeSessionTag("web.app]v2");
      expect(sessionNameFromRunName(runName(tag))).toBe("web-app-v2");
    }),
  );

  it("finds the tag among other bracketed parts of a run name", () => {
    expect(sessionNameFromRunName("hive/nx-nexi [main] [api.s1x2] · broker")).toBe("api");
    expect(sessionNameFromRunName("hive/nx-nexi [main] [s1x2]")).toBeUndefined();
  });
});

describe("isAppStartedSessionRun", () => {
  it.effect("accepts every tag makeSessionTag can mint", () =>
    Effect.gen(function* () {
      for (const name of [null, "pti-polassist", "web.app]v2"]) {
        const tag = yield* makeSessionTag(name);
        expect(isAppStartedSessionRun(runName(tag)), tag).toBe(true);
      }
    }),
  );

  // Real run names, from the fleet's own history.
  it("accepts the app's own sessions, named and plain", () => {
    expect(
      isAppStartedSessionRun(
        "nexi-session [pti-polassist.s21y639cwl7w] · broker · ws m-pj.hive.pti-polassist_ · repo nexplore.ghe.com/hive/pti-polassist",
      ),
    ).toBe(true);
    expect(isAppStartedSessionRun("nexi-session [s1ztl9zoadok] · broker · ws u-pj_")).toBe(true);
    expect(isAppStartedSessionRun("hive/nx-nexi [main] [s1] · ws u-pj_")).toBe(true);
  });

  it("rejects the harness runs that share the login", () => {
    expect(
      isAppStartedSessionRun("nexi-session [flag-verify-1284-102018] · ws flag-verify-1284"),
    ).toBe(false);
    expect(
      isAppStartedSessionRun("nexi-session [e2e-1794379780953] · broker · ws e2e-plain-1794379780"),
    ).toBe(false);
    expect(isAppStartedSessionRun("nexi-session [pr612-live-1793011222] · broker")).toBe(false);
    expect(isAppStartedSessionRun("nexi-session · broker")).toBe(false);
  });
});
