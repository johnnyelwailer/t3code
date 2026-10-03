import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProjectSourceBinding } from "./t3team-orchestrationExt.ts";

const decodeBinding = Schema.decodeUnknownSync(ProjectSourceBinding);

describe("ProjectSourceBinding", () => {
  it("fails to decode a non-local provider with no ids", () => {
    expect(() => decodeBinding({ provider: "atlassian" })).toThrow();
  });

  it("decodes a complete non-local binding", () => {
    const decoded = decodeBinding({
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "ext-1",
      externalProjectKey: "ENG",
    });
    expect(decoded).toEqual({
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "ext-1",
      externalProjectKey: "ENG",
    });
  });

  it("decodes a `local` binding with no ids", () => {
    expect(decodeBinding({ provider: "local" })).toEqual({ provider: "local" });
  });
});
