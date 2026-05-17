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

export async function postJson<TInput extends object, TResponse>(
  httpBaseUrl: string,
  routePath: string,
  body: TInput,
): Promise<TResponse> {
  const url = new URL(routePath, httpBaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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
        : `Request failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!payload) {
    throw new Error("Empty response from backend.");
  }

  return payload as TResponse;
}
