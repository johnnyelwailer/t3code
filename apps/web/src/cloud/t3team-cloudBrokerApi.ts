import type {
  CloudBrokerStatus,
  CloudSessionAttachResult,
  CloudSessionFailureReason,
} from "@t3tools/contracts";

import { readDesktopPrimaryBearerToken } from "~/environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary/target";

/**
 * This machine's server, asked about the Nexi broker (`/api/t3team/cloud-broker/*`). The routes
 * authenticate like the environment API, so the call carries the desktop's primary bearer when there
 * is one and the same-origin session cookie otherwise.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export class CloudBrokerRequestError extends Error {
  constructor(
    message: string,
    /** The server's failure reason when it gave one (`broker_sign_in_required`, …). */
    readonly reason: CloudSessionFailureReason | "unauthorized" | "network",
  ) {
    super(message);
    this.name = "CloudBrokerRequestError";
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const bearer = await readDesktopPrimaryBearerToken().catch(() => null);
  let response: Response;
  try {
    response = await fetch(resolvePrimaryEnvironmentHttpUrl(`/api/t3team/cloud-broker/${path}`), {
      method,
      credentials: "include",
      headers: {
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new CloudBrokerRequestError(
      `Could not reach this machine's server: ${String(cause)}`,
      "network",
    );
  }
  const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (response.ok) return json as T;
  if (response.status === 401)
    throw new CloudBrokerRequestError(
      "This app is not signed in to its own server.",
      "unauthorized",
    );
  throw new CloudBrokerRequestError(
    json.message ?? "The cloud-session service answered unexpectedly.",
    (json.error as CloudSessionFailureReason | undefined) ?? "broker_unavailable",
  );
}

export const cloudBrokerApi = {
  status: () => request<CloudBrokerStatus>("GET", "status"),
  signIn: () => request<CloudBrokerStatus>("POST", "sign-in"),
  signOut: () => request<{ ok: true }>("POST", "sign-out"),
  attach: (sessionId: string) => request<CloudSessionAttachResult>("POST", "attach", { sessionId }),
};
