import { assert, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import {
  DEFAULT_REQUESTED_GRANT_MINUTES,
  grantFromRequestUse,
  UserSecretRequestUse,
} from "./t3team-userSecretRequestUse.ts";

const decode = Schema.decodeUnknownSync(UserSecretRequestUse);
const NOW = Date.parse("2026-10-29T12:00:00Z");

it("a minimal use asks for process injection, approved once per thread, for a limited time", () => {
  const grant = grantFromRequestUse(decode({ name: "NX_GH_PKG_READ_TOKEN" }), NOW);
  assert.deepStrictEqual(grant.deliveryModes, ["processInjection"]);
  assert.strictEqual(grant.approval, "perThread");
  assert.strictEqual(grant.kind, "secret");
  assert.strictEqual(
    grant.expiresAt,
    DateTime.formatIso(DateTime.makeUnsafe(NOW + DEFAULT_REQUESTED_GRANT_MINUTES * 60_000)),
  );
});

it("the host becomes the only destination, and the requested expiry and approval are kept", () => {
  const grant = grantFromRequestUse(
    decode({
      name: "NPM_TOKEN",
      host: "npm.pkg.github.com",
      deliveryModes: ["requestInjection"],
      approval: "perMachine",
      expiresInMinutes: 30,
    }),
    NOW,
  );
  assert.deepStrictEqual(grant.destinations, ["npm.pkg.github.com"]);
  assert.strictEqual(grant.approval, "perMachine");
  assert.strictEqual(grant.expiresAt, DateTime.formatIso(DateTime.makeUnsafe(NOW + 30 * 60_000)));
});

it("a login slot name, a lower-case name and an over-long lifetime are refused", () => {
  for (const use of [
    { name: "AUTH_SLOT_CLAUDE" },
    { name: "token" },
    { name: "API_KEY", expiresInMinutes: 100_000 },
    { name: "API_KEY", deliveryModes: [] },
  ]) {
    assert.throws(() => decode(use));
  }
});
