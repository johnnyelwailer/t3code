/**
 * Whether a failed run died on the NETWORK (the host or its VPN/tunnel lost the connection to the
 * provider) rather than on something the provider answered. Provider-neutral: matched on the code
 * or text a provider surfaces (Node `fetch failed`, socket error codes, Cursor's
 * `connection_stalled` / `API key exchange endpoint` failures, Connect `[unavailable]`).
 * Deliberately NOT matched: `ECONNREFUSED` and bare `connection closed/lost` — a stopped local
 * proxy or an MCP server hanging up is not an outage worth 18 minutes of retries.
 *
 * A network outage can last minutes, so `classifyTransientRunFailure` flags it (`outage`) and the
 * session-level retry gives it the longer budget in `t3team-threadTransientTurnRetryPolicy.ts`.
 */
import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";

const OUTAGE_CODES: ReadonlySet<string> = new Set(["connection_stalled"]);

const OUTAGE_TEXT = new RegExp(
  [
    String.raw`\bfetch failed\b`,
    String.raw`\bfailed to connect to [^\n]*\bendpoint\b`,
    String.raw`\bE(?:CONNRESET|CONNABORTED|TIMEDOUT|NOTFOUND|AI_AGAIN|NETUNREACH|HOSTUNREACH|PIPE)\b`,
    String.raw`\bUND_ERR_(?:SOCKET|CONNECT_TIMEOUT)\b`,
    String.raw`\bother side closed\b`,
    String.raw`\bsocket hang up\b`,
    String.raw`\bnetwork (?:error|is unreachable|connection)\b`,
    String.raw`\bconnection (?:stalled|reset|timed out)\b`,
    String.raw`\[unavailable\]`,
  ].join("|"),
  "i",
);

export const isNetworkOutageFailure = (
  failure: Pick<OrchestrationV2ProviderFailure, "code" | "message">,
): boolean =>
  (failure.code !== null && OUTAGE_CODES.has(failure.code)) || OUTAGE_TEXT.test(failure.message);
