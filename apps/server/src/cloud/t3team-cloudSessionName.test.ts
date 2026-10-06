import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { makeSessionTag, sessionNameFromRunName } from "./t3team-cloudSessionName.ts";

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
