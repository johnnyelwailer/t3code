import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { nextPagePath } from "./t3team-githubLinkPaging.ts";

const next = (host: string, link: string | undefined) =>
  nextPagePath({ host, operation: "test", link });

describe("nextPagePath", () => {
  it.effect("returns the next page as a path under the host's API root", () =>
    Effect.gen(function* () {
      const link =
        '<https://api.github.com/user/repos?per_page=100&page=1>; rel="prev", ' +
        '<https://api.github.com/user/repos?per_page=100&page=3>; rel="next", ' +
        '<https://api.github.com/user/repos?per_page=100&page=9>; rel="last"';
      expect(yield* next("github.com", link)).toBe("user/repos?per_page=100&page=3");
      // Enterprise Server serves its API under /api/v3, which is the root, not part of the path.
      expect(
        yield* next(
          "ghe.example.com",
          '<https://ghe.example.com/api/v3/notifications?page=2>; rel="next"',
        ),
      ).toBe("notifications?page=2");
    }),
  );

  it.effect("returns null on the last page", () =>
    Effect.gen(function* () {
      expect(yield* next("github.com", undefined)).toBeNull();
      expect(
        yield* next("github.com", '<https://api.github.com/user/repos?page=1>; rel="prev"'),
      ).toBeNull();
    }),
  );

  it.effect("refuses a next link that leaves the host's API base", () =>
    Effect.gen(function* () {
      for (const [host, url] of [
        ["github.com", "https://evil.example.com/user/repos?page=2"],
        ["github.com", "https://api.github.com.evil.example.com/user/repos?page=2"],
        ["github.com", "http://api.github.com/user/repos?page=2"],
        ["ghe.example.com", "https://ghe.example.com/other/user/repos?page=2"],
        ["ghe.example.com", "https://api.github.com/user/repos?page=2"],
        ["github.com", "not a url"],
      ] as const) {
        const error = yield* Effect.flip(next(host, `<${url}>; rel="next"`));
        expect(error._tag).toBe("GitHubApiResponseError");
      }
    }),
  );
});
