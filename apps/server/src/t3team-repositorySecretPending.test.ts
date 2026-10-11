import { assert, describe, it } from "@effect/vitest";

import { mergeSecretsWithPending } from "./t3team-repositorySecretPending.ts";

describe("mergeSecretsWithPending", () => {
  it("pending alone becomes the bag", () => {
    assert.deepEqual(mergeSecretsWithPending(undefined, { NPM_TOKEN: "x" }), { NPM_TOKEN: "x" });
  });

  it("grant credentials win over pending with the same name", () => {
    assert.deepEqual(
      mergeSecretsWithPending(
        { GIT_TOKEN: "real", GIT_AUTHOR_NAME: "Ada" },
        { NPM_TOKEN: "x", GIT_TOKEN: "spoof" },
      ),
      { NPM_TOKEN: "x", GIT_TOKEN: "real", GIT_AUTHOR_NAME: "Ada" },
    );
  });

  it("empty pending leaves the base unchanged", () => {
    const base = { GIT_TOKEN: "real" };
    assert.strictEqual(mergeSecretsWithPending(base, {}), base);
  });
});
