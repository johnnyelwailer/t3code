import { assert, describe, it } from "@effect/vitest";

import { avatarIdentity, unresolvableBackoffMs } from "./t3team-pullRequestSyncPolicy.ts";

const MINUTE = 60_000;

describe("unresolvableBackoffMs", () => {
  it("starts short, then fifteen minutes, doubling up to a day", () => {
    assert.deepStrictEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20].map(
        (failures) => unresolvableBackoffMs(failures) / MINUTE,
      ),
      [2, 15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440],
    );
  });
});

describe("avatarIdentity", () => {
  it("drops only the signature GHE puts on every read", () => {
    const base = "https://nexplore.ghe.com/avatars/u/1283972";
    assert.strictEqual(avatarIdentity(`${base}?token=AAA`), avatarIdentity(`${base}?token=BBB`));
    assert.strictEqual(
      avatarIdentity(`${base}?token=AAA&u=abc123`),
      avatarIdentity(`${base}?u=abc123&token=BBB`),
    );
    assert.notStrictEqual(
      avatarIdentity(`${base}?token=AAA&u=abc123`),
      avatarIdentity(`${base}?token=AAA&u=def456`),
    );
  });

  it("keeps the version github.com puts on an avatar", () => {
    const base = "https://avatars.githubusercontent.com/u/854944";
    assert.notStrictEqual(avatarIdentity(`${base}?v=3`), avatarIdentity(`${base}?v=4`));
  });

  it("passes null and unparseable values through", () => {
    assert.strictEqual(avatarIdentity(null), null);
    assert.strictEqual(avatarIdentity("not a url"), "not a url");
  });
});
