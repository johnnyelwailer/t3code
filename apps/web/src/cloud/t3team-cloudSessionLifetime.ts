import { CLOUD_SESSION_HOLD_CEILING_SECONDS } from "@t3tools/contracts";

/**
 * How long a cloud session may live: the fleet's ceiling, always. The session workflow's job times
 * out at 350 minutes and the runner is reaped at 390, so nothing longer survives; a session nobody
 * is connected to is released much earlier by the workflow's idle check. A choice here would only
 * let a session end sooner than the user needs it.
 *
 * The server uses the same constant to say how much of it is left (`remainingSeconds`).
 */
export const CLOUD_SESSION_LIFETIME_SECONDS = CLOUD_SESSION_HOLD_CEILING_SECONDS;
