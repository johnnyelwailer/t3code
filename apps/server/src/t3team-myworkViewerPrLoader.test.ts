import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import { loadViewerPrEntries, loadViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";

const hit = (number: number) => ({
  number,
  title: `PR ${number}`,
  repository: { nameWithOwner: "o/r" },
  updatedAt: "2026-10-07T10:00:00Z",
  isDraft: false,
  author: { login: "me" },
});

/** A gh that answers `auth status` with `hosts`, and each host's searches from `searches`. */
const fakeGh = (
  hosts: ReadonlyArray<string>,
  searches: Record<string, { author?: unknown[]; reviewRequested?: unknown[]; fail?: true }>,
) =>
  ({
    execute: (input: { args: ReadonlyArray<string>; env?: Record<string, string> }) => {
      if (input.args[0] === "auth") {
        return Effect.succeed({
          stdout: JSON.stringify({ hosts: Object.fromEntries(hosts.map((h) => [h, {}])) }),
        });
      }
      const host = input.env?.GH_HOST ?? "";
      const plan = searches[host];
      if (plan === undefined || plan.fail === true) return Effect.fail("gh failed");
      const rows = input.args.includes("--author") ? plan.author : plan.reviewRequested;
      return Effect.succeed({ stdout: JSON.stringify(rows ?? []) });
    },
  }) as never;

const run = <A>(effect: Effect.Effect<A, never, GitHubCli.GitHubCli>, gh: never) =>
  effect.pipe(Effect.provideService(GitHubCli.GitHubCli, gh));

describe("loadViewerPrRead", () => {
  it.effect("keeps a PR that is both yours and up for review once, as yours", () =>
    Effect.gen(function* () {
      const gh = fakeGh(["github.com"], {
        "github.com": { author: [hit(1)], reviewRequested: [hit(1), hit(2)] },
      });
      const result = yield* run(loadViewerPrRead(), gh);
      expect(result.incompleteHosts).toEqual([]);
      expect(
        result.entries.map((e) => [e.number, e.viewerAuthored, e.viewerReviewRequested]),
      ).toEqual([
        [1, true, false],
        [2, false, true],
      ]);
      expect(yield* run(loadViewerPrEntries(), gh)).toEqual(result.entries);
    }),
  );

  it.effect("names a host whose search failed, or filled the page, as incomplete", () =>
    Effect.gen(function* () {
      const full = Array.from({ length: 100 }, (_, i) => hit(i + 1));
      const gh = fakeGh(["ok.example", "down.example", "big.example"], {
        "ok.example": { author: [hit(1)] },
        "down.example": { fail: true },
        "big.example": { author: full },
      });
      const result = yield* run(loadViewerPrRead(), gh);
      expect([...result.incompleteHosts].toSorted()).toEqual(["big.example", "down.example"]);
      expect(result.entries.some((e) => e.host === "ok.example")).toBe(true);
    }),
  );

  it.effect("reports every host incomplete when gh cannot list its hosts", () =>
    Effect.gen(function* () {
      const gh = { execute: () => Effect.fail("no gh") } as never;
      expect(yield* run(loadViewerPrRead(), gh)).toEqual({ entries: [], incompleteHosts: ["*"] });
    }),
  );
});
