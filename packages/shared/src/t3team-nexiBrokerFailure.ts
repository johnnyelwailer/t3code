import { CloudSessionFailedError } from "@t3tools/contracts";

/** A broker failure in the user's terms: sign in again (401), or the broker is unavailable. */
export const failed = (message: string, status?: number) =>
  new CloudSessionFailedError({
    reason: status === 401 ? "broker_sign_in_required" : "broker_unavailable",
    message: status === 401 ? "Your sign-in was not accepted. Sign in again." : message,
  });
