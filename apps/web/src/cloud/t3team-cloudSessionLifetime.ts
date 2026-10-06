/**
 * How long a cloud session may live: the fleet's ceiling, always. The session workflow's job times
 * out at 350 minutes and the runner is reaped at 390, so nothing longer survives; a session nobody
 * is connected to is released much earlier by the workflow's idle check. A choice here would only
 * let a session end sooner than the user needs it.
 */
export const CLOUD_SESSION_LIFETIME_SECONDS = 345 * 60;
