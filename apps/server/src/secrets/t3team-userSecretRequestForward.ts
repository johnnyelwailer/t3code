// @effect-diagnostics nodeBuiltinImport:off - one request on the loopback listener is a Node HTTP boundary.
/**
 * One request through a request-injection listener: it must carry the run's token, it goes only to
 * the route's host over HTTPS (Node's own certificate checks, no custom CA), and it gains the
 * credential header there. Redirects are not followed; a redirect to the same host is pointed back
 * through the listener, any other one reaches the command as is, so its request carries no
 * credential. The response is masked before the command sees it.
 */
import * as NodeCrypto from "node:crypto";
import type * as NodeHttp from "node:http";

import * as Redacted from "effect/Redacted";

import { maskBytes, maskText } from "./t3team-secretMasking.ts";

export type UpstreamFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ProxyRoute {
  readonly name: string;
  readonly host: string;
  readonly header: { readonly name: string; readonly value: Redacted.Redacted<string> };
}

export interface ForwardedRequest {
  readonly name: string;
  readonly host: string;
  readonly method: string;
  readonly status: number;
}

export interface ForwardContext {
  readonly route: ProxyRoute;
  readonly token: string;
  readonly baseUrl: string;
  readonly patterns: ReadonlyArray<string>;
  readonly fetch: UpstreamFetch;
  readonly forwarded: Array<ForwardedRequest>;
}

const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;
const NOT_FORWARDED = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);
const NOT_RETURNED = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

/** The path after the token segment, or undefined when the request lacks the run's token. */
export function pathAfterToken(url: string | undefined, token: string): string | undefined {
  const match = /^\/([^/?#]*)(.*)$/s.exec(url ?? "");
  const segment = Buffer.from(match?.[1] ?? "");
  const expected = Buffer.from(token);
  if (segment.length !== expected.length || !NodeCrypto.timingSafeEqual(segment, expected)) {
    return undefined;
  }
  const rest = match?.[2] ?? "";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function upstreamUrl(host: string, path: string): URL | undefined {
  try {
    const url = new URL(`https://${host}${path}`);
    return url.protocol === "https:" && url.host === host ? url : undefined;
  } catch {
    return undefined;
  }
}

export function rewriteLocation(location: string, host: string, baseUrl: string): string {
  try {
    const target = new URL(location, `https://${host}/`);
    return target.protocol === "https:" && target.host === host
      ? `${baseUrl}${target.pathname}${target.search}${target.hash}`
      : target.toString();
  } catch {
    return location;
  }
}

export function upstreamHeaders(
  incoming: NodeHttp.IncomingHttpHeaders,
  route: ProxyRoute,
): Headers {
  const headers = new Headers();
  const credential = route.header.name.toLowerCase();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || NOT_FORWARDED.has(name) || name === credential) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  headers.set(route.header.name, Redacted.value(route.header.value));
  return headers;
}

function returnedHeaders(response: Response, context: ForwardContext) {
  const headers: Record<string, string | Array<string>> = {};
  const mask = (value: string) => maskText(value, context.patterns).text;
  response.headers.forEach((value, name) => {
    if (NOT_RETURNED.has(name) || name === "set-cookie") return;
    headers[name] =
      name === "location"
        ? mask(rewriteLocation(value, context.route.host, context.baseUrl))
        : mask(value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies.map(mask);
  return headers;
}

async function readBody(request: NodeHttp.IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Array<Buffer> = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_REQUEST_BODY_BYTES) return undefined;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function reply(response: NodeHttp.ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

export async function forwardRequest(
  request: NodeHttp.IncomingMessage,
  response: NodeHttp.ServerResponse,
  context: ForwardContext,
): Promise<void> {
  const path = pathAfterToken(request.url, context.token);
  if (path === undefined) return reply(response, 403, "This address needs the run's token.");
  const { host, name } = context.route;
  const url = upstreamUrl(host, path);
  if (url === undefined) return reply(response, 400, `Only ${host} is reachable here.`);
  const body = await readBody(request);
  if (body === undefined) return reply(response, 413, "The request body is too large.");
  const method = request.method ?? "GET";
  const record = (status: number) => context.forwarded.push({ name, host, method, status });
  const upstream = await context
    .fetch(url.toString(), {
      method,
      headers: upstreamHeaders(request.headers, context.route),
      ...(method === "GET" || method === "HEAD" ? {} : { body: new Uint8Array(body) }),
      redirect: "manual",
    })
    .catch((error: unknown) => error);
  if (!(upstream instanceof Response)) {
    record(502);
    const reason = upstream instanceof Error ? upstream.message : "no answer";
    return reply(
      response,
      502,
      maskText(`Could not reach ${host}: ${reason}`, context.patterns).text,
    );
  }
  record(upstream.status);
  const masked = maskBytes(new Uint8Array(await upstream.arrayBuffer()), context.patterns);
  response.writeHead(upstream.status, returnedHeaders(upstream, context));
  response.end(masked.bytes);
}
