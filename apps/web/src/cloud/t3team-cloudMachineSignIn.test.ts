import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_MACHINE_SIGN_IN_COPY,
  signInDescriptionForEnvironment,
} from "./t3team-cloudMachineSignIn";

const CLOUD_ENV = EnvironmentId.make("env-cloud-1");
const OTHER_ENV = EnvironmentId.make("env-desktop");

function session(phase: CloudSession["phase"]): CloudSession {
  return {
    sessionId: "s1",
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "machine",
    failureReason: null,
    detailsUrl: null,
    environmentId: String(CLOUD_ENV),
  };
}

describe("signInDescriptionForEnvironment", () => {
  it("asks a live cloud session's machine to sign in again", () => {
    expect(signInDescriptionForEnvironment([session("ready")], CLOUD_ENV)).toBe(
      CLOUD_MACHINE_SIGN_IN_COPY,
    );
  });

  it("keeps the tool's own description everywhere else", () => {
    expect(signInDescriptionForEnvironment([session("ready")], OTHER_ENV)).toBeUndefined();
    expect(signInDescriptionForEnvironment([session("stopped")], CLOUD_ENV)).toBeUndefined();
    expect(signInDescriptionForEnvironment([], CLOUD_ENV)).toBeUndefined();
  });
});
