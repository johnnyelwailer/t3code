import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { CredentialRefreshStartInput } from "./t3team-credentialRefresh.ts";

const accepts = Schema.is(CredentialRefreshStartInput);

describe("CredentialRefreshStartInput", () => {
  it("accepts a host and package scopes", () => {
    expect(accepts({ host: "github.com", scopes: ["read:packages", "repo"] })).toBe(true);
  });

  it.each([
    ["a scope that starts with a dash", { host: "github.com", scopes: ["-h"] }],
    ["a scope with a space", { host: "github.com", scopes: ["repo --web"] }],
    ["a scope with a separator", { host: "github.com", scopes: ["repo;ls"] }],
    ["no scopes", { host: "github.com", scopes: [] }],
    ["too many scopes", { host: "github.com", scopes: Array.from({ length: 17 }, () => "repo") }],
    ["a host with a space", { host: "github.com evil", scopes: ["repo"] }],
    ["a host with a separator", { host: "github.com;rm", scopes: ["repo"] }],
    ["a host that starts with a dash", { host: "-h", scopes: ["repo"] }],
  ])("rejects %s", (_name, input) => {
    expect(accepts(input)).toBe(false);
  });
});
