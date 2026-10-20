import { assert, it } from "@effect/vitest";

import { unreadableRepositoryMessage } from "./t3team-unreadableRepositoryMessage.ts";

const subject = { repository: "hive/common-agentdirectives", host: "nexplore.ghe.com" };

it("names the repository and host, then the reason as a sentence", () => {
  assert.strictEqual(
    unreadableRepositoryMessage({ ...subject, reason: "HTTP 404" }),
    "hive/common-agentdirectives on nexplore.ghe.com could not be read: HTTP 404.",
  );
});

it("keeps a reason that already ends a sentence as it is", () => {
  assert.strictEqual(
    unreadableRepositoryMessage({ ...subject, reason: "Run `gh auth login`." }),
    "hive/common-agentdirectives on nexplore.ghe.com could not be read: Run `gh auth login`.",
  );
});

it("says only where when the host gave no reason", () => {
  assert.strictEqual(
    unreadableRepositoryMessage({ ...subject, reason: null }),
    "hive/common-agentdirectives on nexplore.ghe.com could not be read.",
  );
});

it("folds a multi-line CLI report onto one line and caps its length", () => {
  const message = unreadableRepositoryMessage({
    ...subject,
    reason: `first line\n\n  second line ${"x".repeat(400)}`,
  });
  assert.isFalse(message.includes("\n"));
  assert.isTrue(message.includes("first line second line"));
  assert.isTrue(message.length < 320);
});
