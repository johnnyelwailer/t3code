import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { OrchestratorMcpRequestSecretInput } from "./orchestratorMcp.ts";
import { normalizeCredentialHost } from "./t3team-credentialSources.ts";

const decode = Schema.decodeUnknownSync(OrchestratorMcpRequestSecretInput);
const ask = (host: string) =>
  decode({ label: "GitHub Packages token", reason: "Restore packages.", host });

describe("request_secret host", () => {
  it("accepts a feed URL copied verbatim from the repository's config", () => {
    expect(ask("https://nuget.pkg.github.com/nexplore/index.json").host).toBe(
      "nuget.pkg.github.com",
    );
    expect(ask("https://npm.pkg.github.com").host).toBe("npm.pkg.github.com");
    expect(ask("//npm.pkg.github.com/:_authToken").host).toBe("npm.pkg.github.com");
  });

  it("keeps a bare host and drops case, port and credentials", () => {
    expect(ask("npm.pkg.github.com").host).toBe("npm.pkg.github.com");
    expect(ask("NPM.Nexplore.CH:443").host).toBe("npm.nexplore.ch");
    expect(normalizeCredentialHost("https://user@npm.nexplore.ch/")).toBe("npm.nexplore.ch");
  });

  it("still rejects a value with no host in it", () => {
    expect(() => ask("not a host")).toThrow();
    expect(() => ask("https://")).toThrow();
  });
});
