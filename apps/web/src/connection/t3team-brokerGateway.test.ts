import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import { describe, expect, it } from "vite-plus/test";

import { CredentialRequestError } from "~/account/t3team-credentialRequest";

import { mapBrokerCallFailure } from "./t3team-brokerGateway";

describe("mapBrokerCallFailure", () => {
  it("treats an ended session as terminal: blocked, so the supervisor stops retrying", () => {
    const failure = mapBrokerCallFailure(
      new CredentialRequestError("That cloud session has ended.", "session_ended"),
    );
    expect(failure).toBeInstanceOf(ConnectionBlockedError);
    expect(failure).toMatchObject({ failureCause: "session_ended", reason: "configuration" });
  });

  it("keeps a session that is still starting retryable", () => {
    const failure = mapBrokerCallFailure(
      new CredentialRequestError("not running yet", "unknown_session"),
    );
    expect(failure).toBeInstanceOf(ConnectionTransientError);
  });

  it("keeps sign-in problems blocked as authentication", () => {
    const failure = mapBrokerCallFailure(
      new CredentialRequestError("sign in", "broker_sign_in_required"),
    );
    expect(failure).toMatchObject({ _tag: "ConnectionBlockedError", reason: "authentication" });
  });

  it("keeps an unreachable broker retryable", () => {
    expect(
      mapBrokerCallFailure(new CredentialRequestError("down", "broker_unavailable")),
    ).toBeInstanceOf(ConnectionTransientError);
    expect(mapBrokerCallFailure(new Error("boom"))).toBeInstanceOf(ConnectionTransientError);
  });
});
