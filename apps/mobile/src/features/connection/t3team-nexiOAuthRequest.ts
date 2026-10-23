import type { NexiOAuthConfig } from "./t3team-nexiOAuthModel";

/** Only public-client form fields leave the phone; cancellation also bounds issuer downtime. */
export const createNexiOAuthPost =
  (config: NexiOAuthConfig, fetcher: typeof fetch) =>
  (url: string, body: Record<string, string>, signal?: AbortSignal) =>
    fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.app, ...body }).toString(),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
