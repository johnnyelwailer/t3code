import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { gitHubApiUrls } from "./GitHubRequestPolicy.ts";

/**
 * An enterprise's web host answers a token with its sign-in page, so an upload cannot be fetched
 * with one. The markdown API renders it to a short-lived signed object URL instead, given any
 * repository on the host as context: every repository on an enterprise host is the enterprise's.
 */
const LEGACY_UPLOAD_PATH = /^\/([^/]+\/[^/]+)\/assets\/\d+\/[\w-]+$/u;
const IMAGE_SOURCE = /<img\b[^>]*?\ssrc="([^"]+)"/u;
const CONTEXT_TTL = Duration.hours(1);
const REQUEST_TIMEOUT = Duration.seconds(15);
const Repositories = Schema.Array(Schema.Struct({ full_name: Schema.String }));

interface CachedContext {
  readonly repository: string;
  readonly expiresAt: number;
}

export const make = Effect.gen(function* () {
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const contexts = new Map<string, CachedContext>();

  const api = (
    host: string,
    token: Redacted.Redacted<string>,
    request: HttpClientRequest.HttpClientRequest,
  ) =>
    httpClient
      .execute(
        request.pipe(
          HttpClientRequest.prependUrl(gitHubApiUrls(host).rest),
          HttpClientRequest.bearerToken(Redacted.value(token)),
          HttpClientRequest.acceptJson,
        ),
      )
      .pipe(Effect.timeout(REQUEST_TIMEOUT));

  const anyRepository = Effect.fn("GitHubEnterpriseUploadSigning.anyRepository")(function* (
    host: string,
    token: Redacted.Redacted<string>,
  ) {
    const now = yield* Clock.currentTimeMillis;
    const cached = contexts.get(host);
    if (cached !== undefined && cached.expiresAt > now) return cached.repository;
    const repositories = yield* api(
      host,
      token,
      HttpClientRequest.get("/user/repos?per_page=1&sort=pushed"),
    ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Repositories)));
    const repository = repositories[0]?.full_name ?? null;
    if (repository !== null) {
      contexts.set(host, { repository, expiresAt: now + Duration.toMillis(CONTEXT_TTL) });
    }
    return repository;
  });

  /** The signed URL of the upload at `url` on `host`, or null when the host signs none. */
  return Effect.fn("GitHubEnterpriseUploadSigning.sign")(
    function* (host: string, token: Redacted.Redacted<string>, url: URL) {
      const context =
        LEGACY_UPLOAD_PATH.exec(url.pathname)?.[1] ?? (yield* anyRepository(host, token));
      if (context === null) return null;
      const html = yield* api(
        host,
        token,
        HttpClientRequest.post("/markdown").pipe(
          HttpClientRequest.bodyJsonUnsafe({ mode: "gfm", context, text: `![](${url.href})` }),
        ),
      ).pipe(Effect.flatMap((response) => response.text));
      const source = IMAGE_SOURCE.exec(html)?.[1]?.replaceAll("&amp;", "&");
      return source === undefined || source === url.href ? null : source;
    },
    Effect.orElseSucceed(() => null),
  );
});
