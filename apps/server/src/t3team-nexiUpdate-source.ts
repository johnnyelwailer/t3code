/**
 * The one place the interim Nexi Work updater talks to GHE. The host and repository are constants:
 * nothing a caller sends picks where the sign-in goes. The only override is a loopback API base
 * (tests, and the old->new proof against a local mock of the releases API), which cannot leak the
 * credential off the machine.
 */
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { HttpClient, type HttpClientResponse } from "effect/http";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import type { NexiGheRelease } from "@t3tools/shared/t3team-nexiUpdateSelect";

import { fetchAssetResponse } from "./t3team-github-routes-asset-fetch.ts";

export const NEXI_UPDATE_HOST = "nexplore.ghe.com";
export const NEXI_UPDATE_REPO = "hive/nx-nexi";
export const MAX_RELEASE_LIST_BYTES = 4 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
/** Above any installer we ship (~300 MB); a bigger asset is refused, not streamed. */
export const MAX_PAYLOAD_BYTES = 600 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function resolveNexiApiBase(env: Readonly<Record<string, string | undefined>>): string {
  const override = env.T3CODE_NEXI_UPDATE_API_BASE?.trim();
  if (override) {
    const url = URL.parse(override);
    if (url !== null && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
      return url.href.replace(/\/$/u, "");
    }
  }
  return GitHubApi.gitHubApiUrls(NEXI_UPDATE_HOST).rest;
}

/** Why a read of GHE failed, in the terms the update state shows. */
export type NexiSourceFailure =
  | { readonly kind: "signed-out"; readonly message: string }
  | { readonly kind: "unreachable"; readonly message: string };

const signedOut = (message: string): NexiSourceFailure => ({ kind: "signed-out", message });
export const unreachable = (message: string): NexiSourceFailure => ({
  kind: "unreachable",
  message,
});

const ReleaseList = Schema.Array(
  Schema.Struct({
    tag_name: Schema.String,
    draft: Schema.Boolean,
    prerelease: Schema.Boolean,
    body: Schema.NullOr(Schema.String),
    html_url: Schema.String,
    published_at: Schema.NullOr(Schema.String),
    assets: Schema.Array(
      Schema.Struct({
        id: Schema.Number,
        name: Schema.String,
        size: Schema.Number,
        state: Schema.String,
      }),
    ),
  }),
);
const decodeReleases = Schema.decodeUnknownOption(Schema.fromJsonString(ReleaseList));

/** Dependencies are taken once, so a caller of the source needs no services of its own. */
export const makeNexiSource = (
  apiBase: string,
  api: GitHubApi.GitHubApi["Service"],
  http: HttpClient.HttpClient,
) => {
  const repoUrl = `${apiBase}/repos/${NEXI_UPDATE_REPO}`;

  /** The sign-in is read per call: the credential service caches it, and a sign-in made after a failure is picked up. */
  const token = api.credential(NEXI_UPDATE_HOST).pipe(
    Effect.map((credential) => Redacted.value(credential.token)),
    Effect.mapError(() => signedOut(`Sign in to GHE (${NEXI_UPDATE_HOST}) to get updates.`)),
  );

  const get = Effect.fn("t3team.nexiUpdate.get")(function* (url: string, accept: string) {
    const credential = yield* token;
    const response = yield* fetchAssetResponse(new URL(url), credential, accept).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
      // A transport failure can surface as a defect too; either way the cause (which may echo
      // request details) is dropped and only this fixed sentence is kept.
      Effect.catchDefect(() => Effect.fail(null)),
      Effect.mapError(() => unreachable(`Could not reach ${NEXI_UPDATE_HOST}.`)),
    );
    // A 403 with no quota left is GHE's rate limit, not a refused sign-in.
    const rateLimited =
      response.status === 403 &&
      (response.headers["x-ratelimit-remaining"] === "0" ||
        response.headers["retry-after"] !== undefined);
    if (rateLimited) {
      return yield* Effect.fail(
        unreachable(`GHE (${NEXI_UPDATE_HOST}) is rate limiting this sign-in; trying again later.`),
      );
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return yield* Effect.fail(
        signedOut(
          `GHE (${NEXI_UPDATE_HOST}) did not accept your sign-in for ${NEXI_UPDATE_REPO} (HTTP ${response.status}).`,
        ),
      );
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        unreachable(`GHE answered HTTP ${response.status} for the update check.`),
      );
    }
    return response;
  });

  const readCapped = (response: HttpClientResponse.HttpClientResponse, cap: number) =>
    response.text.pipe(
      Effect.mapError(() => unreachable("The update answer could not be read.")),
      Effect.filterOrFail(
        (text) => new TextEncoder().encode(text).length <= cap,
        () => unreachable("The update answer was larger than expected."),
      ),
    );

  const listReleases = Effect.fn("t3team.nexiUpdate.listReleases")(function* () {
    const response = yield* get(`${repoUrl}/releases?per_page=50`, "application/vnd.github+json");
    const parsed = decodeReleases(yield* readCapped(response, MAX_RELEASE_LIST_BYTES));
    if (parsed._tag === "None")
      return yield* Effect.fail(unreachable("GHE sent an unreadable release list."));
    return parsed.value as ReadonlyArray<NexiGheRelease>;
  });

  const assetUrl = (assetId: number) => `${repoUrl}/releases/assets/${assetId}`;

  const readManifestText = (assetId: number) =>
    get(assetUrl(assetId), "application/octet-stream").pipe(
      Effect.flatMap((response) => readCapped(response, MAX_MANIFEST_BYTES)),
    );

  const openAsset = (assetId: number) => get(assetUrl(assetId), "application/octet-stream");

  return { listReleases, readManifestText, openAsset };
};
export type NexiSource = ReturnType<typeof makeNexiSource>;
