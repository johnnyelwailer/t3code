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
  if (typeof message !== "object" || message === null || !("method" in message) ||
      message.method !== "tools/call" || !("params" in message)) return message;
  const params = message.params;
  if (typeof params !== "object" || params === null || !("name" in params) ||
      typeof params.name !== "string") return message;
  const name = aliases.get(params.name);
  return name ? { ...message, params: { ...params, name } } : message;
};

// Runs after bearer authentication; the ordinary MCP dispatcher still validates
// parameters and invokes the same thread-scoped handlers for both spellings.
// Normalization is a pure fall-through: if the body cannot be read/rewritten the
// ORIGINAL request passes through and the MCP transport's own parse/validation
// errors apply — the legacy shim must never break a request the dispatcher
// would otherwise handle.
export const normalizeLegacyToolRequest = Effect.fn("normalizeLegacyToolRequest")(
  function* (request: HttpServerRequest.HttpServerRequest) {
    if (request.method !== "POST") return request;
    return yield* Effect.gen(function* () {
      const text = yield* request.text;
      let message: unknown;
      try { message = JSON.parse(text); } catch { return request; }
      const normalized = normalizeLegacyToolCall(message);
      if (normalized === message) return request;
      const web = yield* HttpServerRequest.toWeb(request);
      const headers = new Headers(web.headers);
      headers.delete("content-length");
      return HttpServerRequest.fromWeb(new Request(web.url, {
        method: web.method,
        headers,
        body: JSON.stringify(normalized),
      })).modify({ url: request.url, remoteAddress: request.remoteAddress });
    }).pipe(
      Effect.matchCause({
        onFailure: () => request,
        onSuccess: (normalized) => normalized,
      }),
    );
  },
);
