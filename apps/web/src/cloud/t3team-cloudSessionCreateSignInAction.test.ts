import { describe, expect, it } from "vite-plus/test";

import { cloudSessionCreateSignInAction } from "./t3team-cloudSessionCreateSignInAction";

describe("cloudSessionCreateSignInAction", () => {
  const onSignIn = () => {};

  it("offers Sign in when a create failed for a sign-in reason", () => {
    expect(
      cloudSessionCreateSignInAction({
        createFailed: true,
        failureReason: "broker_sign_in_required",
        onSignIn,
      }),
    ).toEqual({ id: "sign-in", label: "Sign in", onClick: onSignIn });
    expect(
      cloudSessionCreateSignInAction({
        failureKind: "create_failed",
        failureReason: "unauthorized",
        onSignIn,
      }),
    ).toMatchObject({ id: "sign-in", label: "Sign in" });
  });

  it("is silent when the create did not fail, or the reason is not a sign-in", () => {
    expect(
      cloudSessionCreateSignInAction({
        createFailed: true,
        failureReason: "broker_unavailable",
        onSignIn,
      }),
    ).toBeNull();
    expect(
      cloudSessionCreateSignInAction({
        failureKind: "project_not_resolved",
        failureReason: "broker_sign_in_required",
        onSignIn,
      }),
    ).toBeNull();
    expect(cloudSessionCreateSignInAction({ onSignIn })).toBeNull();
  });
});
