export function resolveWsUrl(rawUrl: string): string {
  const resolved = new URL(rawUrl);
  if (resolved.protocol === "http:") resolved.protocol = "ws:";
  else if (resolved.protocol === "https:") resolved.protocol = "wss:";
  resolved.pathname = "/ws";
  return resolved.toString();
}

export function resolveHttpBaseUrl(rawUrl: string): string {
  const resolved = new URL(rawUrl);
  if (resolved.protocol === "ws:") resolved.protocol = "http:";
  else if (resolved.protocol === "wss:") resolved.protocol = "https:";

  if (resolved.pathname === "/ws") {
    resolved.pathname = "/";
  }

  if (!resolved.pathname.endsWith("/")) {
    resolved.pathname = `${resolved.pathname}/`;
  }

  return resolved.toString();
}

const BACKEND_POST_TIMEOUT_MS = 15_000;

function buildBackendFetchErrorMessage(input: { url: URL; error: unknown }): string {
  const reason = input.error instanceof Error ? input.error.message : String(input.error);
  const browserOrigin = globalThis.location?.origin;
  const isCrossOrigin = browserOrigin ? browserOrigin !== input.url.origin : false;

  const parts = [
    `Failed to reach backend ${input.url.pathname} at ${input.url.origin}.`,
    `Fetch error: ${reason}.`,
  ];

  if (browserOrigin) {
    parts.push(`Browser origin: ${browserOrigin}.`);
  }

  if (isCrossOrigin) {
    parts.push(
      "This is a cross-origin browser request. If the backend is running, a CORS mismatch or blocked preflight likely prevented the request from reaching the route.",
    );
  }

  return parts.join(" ");
}

/**
 * `timeoutMs` overrides the default for routes that legitimately take longer than one request. The
 * Atlassian OAuth completion, for instance, makes three sequential Atlassian calls server-side, each
 * with its own 12s budget — giving up at 15s would abandon a request that was still going to succeed
 * and report a failure for a sign-in that actually completed.
 */
export async function postJson<TInput extends object, TResponse>(
  httpBaseUrl: string,
  routePath: string,
  body: TInput,
  options?: { readonly timeoutMs?: number },
): Promise<TResponse> {
  const url = new URL(routePath, httpBaseUrl);
  const abortController = new AbortController();
  let didTimeout = false;
  const timeoutMs = options?.timeoutMs ?? BACKEND_POST_TIMEOUT_MS;
  const timeoutHandle = globalThis.setTimeout(() => {
    didTimeout = true;
    abortController.abort();
  }, timeoutMs);

  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortController.signal,
  })
    .catch((error) => {
      throw new Error(
        buildBackendFetchErrorMessage({
          url,
          error: didTimeout ? new Error(`Backend request timed out after ${timeoutMs}ms`) : error,
        }),
      );
    })
    .finally(() => {
      globalThis.clearTimeout(timeoutHandle);
    });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | TResponse
    | null;

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request to ${url.pathname} failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!payload) {
    throw new Error("Empty response from backend.");
  }

  return payload as TResponse;
}
