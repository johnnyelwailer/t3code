import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  missingToolAuthEnvironmentError,
  resolveToolAuthEnvironmentId,
} from "./t3team-toolauthActions";

describe("resolveToolAuthEnvironmentId", () => {
  it("prefers the cloud/thread environment over the primary", () => {
    expect(
      resolveToolAuthEnvironmentId(
        EnvironmentId.make("env-cloud"),
        EnvironmentId.make("env-primary"),
      ),
    ).toBe("env-cloud");
  });

  it("falls back to the primary when the thread has not named one", () => {
    expect(resolveToolAuthEnvironmentId(undefined, EnvironmentId.make("env-primary"))).toBe(
      "env-primary",
    );
  });

  it("stays null when neither environment exists (never silently pretend it does)", () => {
    expect(resolveToolAuthEnvironmentId(null, null)).toBeNull();
    expect(resolveToolAuthEnvironmentId(undefined, null)).toBeNull();
  });
});

describe("missingToolAuthEnvironmentError", () => {
  it("names the tool and the missing cloud environment", () => {
    expect(missingToolAuthEnvironmentError("Claude Code", "install")).toEqual({
      title: "Could not install Claude Code",
      description: "No cloud session environment is available to run this on yet.",
    });
  });
});
