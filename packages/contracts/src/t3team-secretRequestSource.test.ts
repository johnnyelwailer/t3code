import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { OrchestratorMcpRequestSecretInput } from "./orchestratorMcp.ts";
import { OrchestrationV2SecretRequestSource } from "./orchestrationV2.ts";

const decodeInput = Schema.decodeUnknownSync(OrchestratorMcpRequestSecretInput);
const decodeSource = Schema.decodeUnknownSync(OrchestrationV2SecretRequestSource);

it("request_secret accepts what the credential is for, and stays valid without it", () => {
  const hinted = decodeInput({
    label: "GitHub packages token",
    reason: "npm ci needs it",
    delivery: "file",
    host: "npm.pkg.github.com",
    name: "NX_GH_PKG_READ_TOKEN",
    scopes: ["read:packages"],
  });
  assert.strictEqual(hinted.host, "npm.pkg.github.com");
  assert.deepStrictEqual(hinted.scopes, ["read:packages"]);
  const plain = decodeInput({ label: "Token", reason: "for a webhook" });
  assert.strictEqual(plain.host, undefined);
});

it("the turn item's source carries only host, name and scopes", () => {
  assert.deepStrictEqual(decodeSource({ host: "github.com", scopes: ["repo"] }), {
    host: "github.com",
    scopes: ["repo"],
  });
});
