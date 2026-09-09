// @effect-diagnostics preferSchemaOverJson:off - the JSON-RPC body is opaque to this seam: it is parsed only to rewrite tools/call names and re-serialized verbatim; invalid JSON intentionally falls through to the original request.
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http";

import { T3TeamToolkit, T3TEAM_MCP_DEPRECATED_TOOL_ALIASES } from "./toolkits/t3team/tools.ts";

// Removable compatibility boundary. Aliases never enter the advertised toolkit.
const aliases = new Map<string, string>([
  ...Object.keys(T3TeamToolkit.tools).map((name): [string, string] => [`t3team_${name}`, name]),
  ...Object.entries(T3TEAM_MCP_DEPRECATED_TOOL_ALIASES),
]);

export const normalizeLegacyToolCall = (message: unknown): unknown => {
  if (Array.isArray(message)) return message.map(normalizeLegacyToolCall);
  if (
    typeof message !== "object" ||
    message === null ||
    !("method" in message) ||
    message.method !== "tools/call" ||
    !("params" in message)
  )
    return message;
  const params = message.params;
  if (
    typeof params !== "object" ||
    params === null ||
    !("name" in params) ||
    typeof params.name !== "string"
  )
    return message;
  const name = aliases.get(params.name);
  return name ? { ...message, params: { ...params, name } } : message;
};

// Runs after bearer authentication; the ordinary MCP dispatcher still validates
// parameters and invokes the same thread-scoped handlers for both spellings.
// Normalization is a typed-error fall-through: ONLY the request/read failures the
// inner effect declares (HttpServerError / RequestParseError from request.text and
// toWeb) pass the ORIGINAL request through, so the MCP transport's own parse and
// validation errors apply to whatever the shim could not rewrite. Defects stay
// defects and cancellation stays cancellation — Effect.catch recovers typed errors
// only; Effect.matchCause would swallow interruptions (Cause.Done) and dies as
// successful fall-throughs.
export const normalizeLegacyToolRequest = Effect.fn("normalizeLegacyToolRequest")(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  if (request.method !== "POST") return request;
  return yield* Effect.gen(function* () {
    const text = yield* request.text;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return request;
    }
    const normalized = normalizeLegacyToolCall(message);
    if (normalized === message) return request;
    const web = yield* HttpServerRequest.toWeb(request);
    const headers = new Headers(web.headers);
    headers.delete("content-length");
    return HttpServerRequest.fromWeb(
      new Request(web.url, {
        method: web.method,
        headers,
        body: JSON.stringify(normalized),
      }),
    ).modify({ url: request.url, remoteAddress: request.remoteAddress });
  }).pipe(Effect.catch(() => Effect.succeed(request)));
});
