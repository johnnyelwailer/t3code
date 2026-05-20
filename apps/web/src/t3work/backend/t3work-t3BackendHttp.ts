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

export async function postJson<TInput extends object, TResponse>(
  httpBaseUrl: string,
  routePath: string,
  body: TInput,
): Promise<TResponse> {
  const url = new URL(routePath, httpBaseUrl);
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    throw new Error(
      buildBackendFetchErrorMessage({
        url,
        error,
      }),
    );
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
