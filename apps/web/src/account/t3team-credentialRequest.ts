import { readDesktopPrimaryBearerToken } from "~/environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary/target";

/**
 * A call to this machine's own server on a credential route (`/api/t3team/…`: account sign-in,
 * cloud-session attach). The routes authenticate like the environment API, so the call carries the
 * desktop's primary bearer when there is one and the same-origin session cookie otherwise.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export class CredentialRequestError extends Error {
  constructor(
    message: string,
    /** The server's failure reason when it gave one (`sign_in_required`, …). */
    readonly reason: string,
  ) {
    super(message);
    this.name = "CredentialRequestError";
  }
}

export async function credentialRequest<T>(
  method: "GET" | "POST",
  path: `/api/t3team/${string}`,
  options: { readonly body?: object; readonly timeoutMs?: number; readonly fallbackReason: string },
): Promise<T> {
  const bearer = await readDesktopPrimaryBearerToken().catch(() => null);
  let response: Response;
  try {
    response = await fetch(resolvePrimaryEnvironmentHttpUrl(path), {
      method,
      // Bearer (desktop) or the same-origin session cookie (web), never both: a credentialed
      // cross-origin read is refused by CORS anyway.
      credentials: bearer ? "omit" : "include",
      headers: {
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new CredentialRequestError(
      `Could not reach this machine's server: ${String(cause)}`,
      "network",
    );
  }
  const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (response.ok) return json as T;
  if (response.status === 401) {
    throw new CredentialRequestError(
      "This app is not signed in to its own server.",
      "unauthorized",
    );
  }
  throw new CredentialRequestError(
    json.message ?? "This machine's server answered unexpectedly.",
    json.error ?? options.fallbackReason,
  );
}
