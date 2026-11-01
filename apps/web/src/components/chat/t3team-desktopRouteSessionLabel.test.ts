import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { desktopRouteSessionLabel } from "./t3team-desktopRouteSessionLabel";

const env = (id: string) => id as EnvironmentId;
const sessions = [
  { sessionId: "111", environmentId: "env-other", name: "other-repo" },
  { sessionId: "4242", environmentId: "env-cloud", name: "acme-api" },
];

describe("desktopRouteSessionLabel", () => {
  it("names the session of the thread's own environment, with its id", () => {
    expect(desktopRouteSessionLabel(env("env-cloud"), sessions)).toBe("acme-api (#4242)");
  });

  it("does not guess when the environment matches no session or several", () => {
    expect(desktopRouteSessionLabel(env("env-none"), sessions)).toBe("This cloud session");
    expect(
      desktopRouteSessionLabel(env("env-cloud"), [
        ...sessions,
        { ...sessions[1]!, sessionId: "9" },
      ]),
    ).toBe("This cloud session");
  });
});
