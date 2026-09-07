/**
 * The `/mcp` 401 body, written for the reader it actually has: an agent.
 *
 * The bare version said only that a credential was required, which is
 * indistinguishable from the server being down. A thread whose credential died
 * mid-session read it that way, reported the whole platform as unavailable and
 * stopped trying for ~50 minutes. `reason` names which of the two failures it
 * is, and `recoverable` tells a client whose host can re-mint (see
 * `t3team-mcp-credentialRecovery.ts`) that a retry is worth doing.
 *
 * @module t3team-mcp-unauthorizedResponse
 */
import { HttpServerResponse } from "effect/unstable/http";

export type McpUnauthorizedReason = "missing_bearer_token" | "unknown_or_expired_token";

export const mcpUnauthorizedResponse = (reason: McpUnauthorizedReason) =>
  HttpServerResponse.jsonUnsafe(
    {
      error: "invalid_mcp_credential",
      reason,
      recoverable: reason === "unknown_or_expired_token",
      message:
        reason === "missing_bearer_token"
          ? "This request carried no MCP bearer credential. The T3 Code server is running; only the credential is missing."
          : "This MCP bearer credential is no longer valid for any thread on this server — it was superseded or the session it belonged to ended. The T3 Code server is running: re-establish the thread's credential and retry, or start a new turn to get a fresh one.",
    },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": "Bearer",
      },
    },
  );
