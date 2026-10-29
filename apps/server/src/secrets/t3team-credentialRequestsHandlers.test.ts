import { assert, it } from "@effect/vitest";
import { UserSecretRequestUse, grantFromRequestUse } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { makeCredentialRequestsHandlers } from "./t3team-credentialRequestsHandlers.ts";
import { makeRequestedUserSecrets } from "./t3team-RequestedUserSecrets.ts";

const decodeUse = Schema.decodeUnknownSync(UserSecretRequestUse);
const use = decodeUse({ name: "NX_GH_PKG_READ_TOKEN", host: "npm.pkg.github.com" });

it.effect("the card sees what is asked, then what was granted, and can revoke it", () =>
  Effect.gen(function* () {
    const store = makeRequestedUserSecrets({ reserved: () => false });
    const handlers = makeCredentialRequestsHandlers(store);
    yield* store.trackPending({ threadId: "t1", turnItemId: "i1", use });
    assert.deepStrictEqual(yield* handlers.list("t1"), {
      pending: [{ turnItemId: "i1", use }],
      granted: [],
    });
    yield* store.untrack("i1");
    yield* store.register(grantFromRequestUse(use, 0), Redacted.make("canary-granted-value"));
    const listed = yield* handlers.list("t1");
    assert.strictEqual(listed.granted[0]?.name, "NX_GH_PKG_READ_TOKEN");
    assert.deepStrictEqual(listed.granted[0]?.destinations, ["npm.pkg.github.com"]);
    assert.notInclude(JSON.stringify(listed), "canary-granted-value");
    assert.deepStrictEqual(yield* handlers.revoke("NX_GH_PKG_READ_TOKEN"), { revoked: true });
    assert.deepStrictEqual(yield* handlers.revoke("NX_GH_PKG_READ_TOKEN"), { revoked: false });
    assert.deepStrictEqual((yield* handlers.list("t1")).granted, []);
  }),
);
