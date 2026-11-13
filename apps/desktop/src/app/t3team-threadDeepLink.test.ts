import { assert, describe, it } from "@effect/vitest";

import { parseThreadDeepLink, threadDeepLinkToT3codeUrl } from "./t3team-threadDeepLink.ts";

const NEXI = ["nexi"] as const;

describe("parseThreadDeepLink", () => {
  it("resolves a distribution-scheme thread link to the app path", () => {
    assert.equal(parseThreadDeepLink("nexi://threads/env-1/thread-1", NEXI), "/env-1/thread-1");
  });

  it("keeps a URL-encoded thread id intact", () => {
    assert.equal(parseThreadDeepLink("nexi://threads/env-1/mcp%3Aabc", NEXI), "/env-1/mcp%3Aabc");
  });

  it("accepts the scheme case-insensitively and a trailing slash", () => {
    assert.equal(parseThreadDeepLink("NEXI://threads/env-1/thread-1/", NEXI), "/env-1/thread-1");
  });

  it("never parses when the build registered no schemes", () => {
    assert.isNull(parseThreadDeepLink("nexi://threads/env-1/thread-1", []));
  });

  it("rejects a scheme the build did not register", () => {
    assert.isNull(parseThreadDeepLink("other://threads/env-1/thread-1", NEXI));
  });

  it("rejects a host that is not the threads collection", () => {
    assert.isNull(parseThreadDeepLink("nexi://new/env-1/thread-1", NEXI));
    assert.isNull(parseThreadDeepLink("nexi://apps/env-1/thread-1", NEXI));
  });

  it("rejects a bare scheme with no path", () => {
    for (const url of ["nexi://", "nexi:///", "nexi:"])
      assert.isNull(parseThreadDeepLink(url, NEXI));
  });

  it("rejects a path with more or fewer than two segments", () => {
    assert.isNull(parseThreadDeepLink("nexi://threads/env-1", NEXI));
    assert.isNull(parseThreadDeepLink("nexi://threads/env-1/thread-1/deep", NEXI));
  });

  it("rejects an empty path segment", () => {
    assert.isNull(parseThreadDeepLink("nexi://threads//thread-1", NEXI));
    assert.isNull(parseThreadDeepLink("nexi://threads/env-1/", NEXI));
  });

  it("rejects a non-URL value", () => {
    assert.isNull(parseThreadDeepLink("not a url", NEXI));
  });
});

describe("threadDeepLinkToT3codeUrl", () => {
  it("rewrites a distribution link to the matching t3code deep link", () => {
    assert.equal(
      threadDeepLinkToT3codeUrl("nexi://threads/env-1/thread-1", NEXI, "t3code"),
      "t3code://threads/env-1/thread-1",
    );
  });

  it("uses the development scheme in a dev build", () => {
    assert.equal(
      threadDeepLinkToT3codeUrl("nexi://threads/env-1/thread-1", NEXI, "t3code-dev"),
      "t3code-dev://threads/env-1/thread-1",
    );
  });

  it("preserves a URL-encoded thread id through the rewrite", () => {
    assert.equal(
      threadDeepLinkToT3codeUrl("nexi://threads/env-1/mcp%3Aabc", NEXI, "t3code"),
      "t3code://threads/env-1/mcp%3Aabc",
    );
  });

  it("returns null when the value is not a distribution thread link", () => {
    assert.isNull(threadDeepLinkToT3codeUrl("nexi://", NEXI, "t3code"));
    assert.isNull(threadDeepLinkToT3codeUrl("t3code://threads/env-1/thread-1", NEXI, "t3code"));
    assert.isNull(threadDeepLinkToT3codeUrl("nexi://threads/env-1", [], "t3code"));
  });
});
