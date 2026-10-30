import { describe, expect, it } from "vite-plus/test";

import {
  credentialRequestIntro,
  credentialSourceOptions,
} from "./t3team-credentialSourceOptions.ts";

const source = {
  host: "npm.pkg.github.com",
  name: "NX_GH_PKG_READ_TOKEN",
  scopes: ["read:packages"],
};

describe("credentialSourceOptions", () => {
  it("offers the user's gh sign-in with its account when the scope is there", () => {
    const [gh] = credentialSourceOptions({
      sources: [
        {
          kind: "gh",
          host: "npm.pkg.github.com",
          account: "pj",
          scopeCheck: "ok",
          missingScopes: [],
        },
        { kind: "manual" },
      ],
    });
    expect(gh).toMatchObject({ id: "gh", disabled: false });
    expect(gh?.label).toContain("pj");
    expect(gh?.label).toContain("npm.pkg.github.com");
  });

  it("shows the one-line refresh command and disables a sign-in whose scope is missing", () => {
    const [gh] = credentialSourceOptions({
      sources: [
        {
          kind: "gh",
          host: "github.com",
          account: "pj",
          scopeCheck: "missing",
          missingScopes: ["read:packages"],
          refreshCommand: "gh auth refresh -h github.com -s read:packages",
        },
      ],
    });
    expect(gh?.disabled).toBe(true);
    expect(gh?.hint).toBe("gh auth refresh -h github.com -s read:packages");
  });

  it("an unknown scope check stays usable and says it could not be checked", () => {
    const [gh] = credentialSourceOptions({
      sources: [
        { kind: "gh", host: "github.com", account: "pj", scopeCheck: "unknown", missingScopes: [] },
      ],
    });
    expect(gh?.disabled).toBe(false);
    expect(gh?.detail).toContain("could not be checked");
  });

  it("names the environment variable, warns about another kind of secret, never shows a value", () => {
    const options = credentialSourceOptions({
      sources: [{ kind: "env", name: "NX_GH_PKG_READ_TOKEN", warning: "different_secret_type" }],
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.label).toContain("NX_GH_PKG_READ_TOKEN");
    expect(options[0]?.warning).toContain("different kind of secret");
  });

  it("manual entry is not an option: the input stays the default", () => {
    expect(credentialSourceOptions({ sources: [{ kind: "manual" }] })).toEqual([]);
  });
});

describe("credentialRequestIntro", () => {
  it("says in plain words what is asked and that nothing leaves the device before a choice", () => {
    const text = credentialRequestIntro(source);
    expect(text).toContain("npm.pkg.github.com");
    expect(text).toContain("read:packages");
    expect(text).toContain("NX_GH_PKG_READ_TOKEN");
    expect(text).toContain("Nothing is sent until you choose");
  });
  it("is quiet when the request names nothing", () => {
    expect(credentialRequestIntro({})).toBe("");
  });
});
