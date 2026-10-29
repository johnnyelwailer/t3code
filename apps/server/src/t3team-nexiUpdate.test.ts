/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off - the fake release hashes its payload.
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
/**
 * The interim updater's server routes against a fake GHE: only the configured repo is read, only
 * assets the last check vetted are served, the sign-in is used but never shown, and every failure
 * reaches the desktop as a typed state rather than an error page.
 */
import * as NodeCrypto from "node:crypto";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse, HttpRouter } from "effect/http";
import { describe, expect, it } from "vite-plus/test";

import { makeNexiUpdateRouteLayer } from "./t3team-nexiUpdate-routes.ts";
import { createNexiAssetRegistry } from "./t3team-nexiUpdate-service.ts";
import { resolveNexiApiBase } from "./t3team-nexiUpdate-source.ts";

const TOKEN = "ghe-secret-token-123";
const API = "https://api.nexplore.ghe.com/repos/hive/nx-nexi";
const BYTES = "zip bytes of the new build";
const SHA512 = NodeCrypto.createHash("sha512").update(BYTES).digest("base64");
const asset = (id: number, name: string, size: number) => ({ id, name, size, state: "uploaded" });
const release = (version: string, firstId: number, tag = `desktop-v${version}`) => ({
  tag_name: tag,
  draft: false,
  prerelease: true,
  body: `Notes for ${version}`,
  html_url: `https://nexplore.ghe.com/hive/nx-nexi/releases/tag/${tag}`,
  published_at: "2026-10-29T10:00:00Z",
  assets: [
    asset(firstId, `Nexi-Work-${version}-arm64-mac.zip`, BYTES.length),
    asset(firstId + 1, `Nexi-Work-${version}-x64-20261027-0647.exe`, 10),
    asset(firstId + 2, "latest-mac.yml", 300),
    asset(firstId + 3, "latest.yml", 300),
  ],
});
const manifest = (version: string, sha = SHA512, size = BYTES.length) =>
  `version: ${version}\nfiles:\n  - url: Nexi-Work-${version}-arm64-mac.zip\n    sha512: ${sha}\n    size: ${size}\npath: Nexi-Work-${version}-arm64-mac.zip\nsha512: ${sha}\n`;

interface Fake {
  readonly releases: unknown;
  readonly status?: number;
  readonly manifestText?: string;
  readonly contentLength?: string;
  readonly credentialFails?: boolean;
  readonly networkDown?: boolean;
  readonly body?: string;
}
function boot(fake: Fake) {
  const seen: Array<{
    url: string;
    authorization: string | undefined;
    accept: string | undefined;
  }> = [];
  const ghe = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      seen.push({
        url: request.url,
        authorization: request.headers["authorization"],
        accept: request.headers["accept"],
      });
      if (fake.networkDown) return Effect.die(new Error(`connect ECONNREFUSED with ${TOKEN}`));
      const respond = (body: string, init: ResponseInit = {}) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, init)));
      if (fake.status !== undefined && fake.status !== 200)
        return respond(fake.body ?? "", { status: fake.status });
      if (request.url.includes("/releases?")) return respond(JSON.stringify(fake.releases));
      if (request.url.endsWith("/102")) return respond(fake.manifestText ?? manifest("0.1.2-rc.5"));
      if (request.url.endsWith("/100")) {
        return respond(BYTES, {
          headers: { "content-length": fake.contentLength ?? String(BYTES.length) },
        });
      }
      return respond("not found", { status: 404 });
    }),
  );
  const credential = fake.credentialFails
    ? Effect.fail(
        new GitHubApi.GitHubApiAuthenticationError({
          host: "nexplore.ghe.com",
          operation: "credential",
        }),
      )
    : Effect.succeed({ token: Redacted.make(TOKEN), fingerprint: "f" });
  const services = Layer.mergeAll(
    ghe,
    Layer.mock(GitHubApi.GitHubApi)({ credential: () => credential as never }),
  ).pipe(Layer.provideMerge(NodeServices.layer));
  const serve = HttpRouter.serve(makeNexiUpdateRouteLayer(createNexiAssetRegistry()), {
    disableListenLog: true,
  }).pipe(Layer.provide(services), Layer.provideMerge(NodeHttpServer.layerTest));
  const call = (
    path: string,
    headers: Record<string, string> = { authorization: "Bearer local" },
  ) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const http = yield* HttpClient.HttpClient;
          const response = yield* http.get(path, { headers });
          return { status: response.status, text: yield* response.text };
        }),
      ).pipe(Effect.provide(Layer.mergeAll(serve, NodeServices.layer))),
    );
  return { seen, call };
}

const LATEST = "/api/t3team/nexi-update/latest?version=0.1.2-rc.4&platform=darwin&arch=arm64";
const twoReleases = [
  release("0.1.2-rc.4", 90),
  release("0.1.2-rc.5", 100),
  release("2.0.1", 500, "android-v2.0.1"),
];

describe("nexi-update routes", () => {
  it("offers rc.5 to an rc.4 build with the manifest's sha512, using the sign-in against the one repo", async () => {
    const { seen, call } = boot({ releases: twoReleases });
    const { status, text } = await call(LATEST);
    expect(status, text).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      kind: "available",
      version: "0.1.2-rc.5",
      tag: "desktop-v0.1.2-rc.5",
      notes: "Notes for 0.1.2-rc.5",
      file: {
        assetId: 100,
        name: "Nexi-Work-0.1.2-rc.5-arm64-mac.zip",
        size: BYTES.length,
        sha512: SHA512,
      },
    });
    expect(text).not.toContain(TOKEN);
    expect(seen.map((request) => request.url)).toEqual([
      `${API}/releases?per_page=50`,
      `${API}/releases/assets/102`,
    ]);
    expect(seen.every((request) => request.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(seen[1]?.accept).toBe("application/octet-stream");
  });

  it("takes no host, repository or url from the caller", async () => {
    const { seen, call } = boot({ releases: twoReleases });
    await call(`${LATEST}&host=evil.example&repo=evil/repo&url=http://evil.example/x`);
    expect(seen.every((request) => request.url.startsWith(API))).toBe(true);
  });

  it("serves an asset the check vetted, and nothing else: a foreign or android asset id is a 404 with no GHE request", async () => {
    const { seen, call } = boot({ releases: twoReleases });
    await call(LATEST);
    const before = seen.length;
    for (const id of ["500", "101", "1", "99999999999999"]) {
      const refused = await call(`/api/t3team/nexi-update/asset?id=${id}`);
      expect(refused.status, id).toBe(404);
    }
    expect((await call("/api/t3team/nexi-update/asset?id=abc")).status).toBe(400);
    expect((await call("/api/t3team/nexi-update/asset?id=100/../x")).status).toBe(400);
    expect(seen.length).toBe(before);
    const served = await call("/api/t3team/nexi-update/asset?id=100");
    expect(served).toEqual({ status: 200, text: BYTES });
    expect(seen.at(-1)?.url).toBe(`${API}/releases/assets/100`);
  });

  it("refuses an asset id before any check has vetted one", async () => {
    const { seen, call } = boot({ releases: twoReleases });
    expect((await call("/api/t3team/nexi-update/asset?id=100")).status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("answers only the desktop's bearer: no Authorization header means 403 and no GHE traffic", async () => {
    const { seen, call } = boot({ releases: twoReleases });
    expect((await call(LATEST, {})).status).toBe(403);
    expect((await call("/api/t3team/nexi-update/asset?id=100", {})).status).toBe(403);
    expect((await call(LATEST, { cookie: "t3_session=abc" })).status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("says signed-out without touching GHE when there is no credential, and when GHE rejects it", async () => {
    const none = boot({ releases: [], credentialFails: true });
    expect(JSON.parse((await none.call(LATEST)).text)).toMatchObject({ kind: "signed-out" });
    expect(none.seen).toEqual([]);
    for (const status of [401, 403, 404]) {
      const rejected = boot({ releases: [], status });
      const result = JSON.parse((await rejected.call(LATEST)).text);
      expect(result.kind, String(status)).toBe("signed-out");
      expect(result.message).not.toContain(TOKEN);
    }
  });

  it("says unreachable, never the token, when GHE cannot be reached or answers 5xx", async () => {
    const down = boot({ releases: [], networkDown: true });
    const downResult = await down.call(LATEST);
    expect(JSON.parse(downResult.text)).toMatchObject({ kind: "unreachable" });
    expect(downResult.text).not.toContain(TOKEN);
    const broken = boot({ releases: [], status: 502, body: `bad gateway for ${TOKEN}` });
    const brokenResult = await broken.call(LATEST);
    expect(JSON.parse(brokenResult.text)).toMatchObject({ kind: "unreachable" });
    expect(brokenResult.text).not.toContain(TOKEN);
  });

  it("is up to date when nothing newer exists, and unsupported on an Intel Mac without asking GHE", async () => {
    expect(
      JSON.parse((await boot({ releases: twoReleases }).call(LATEST.replace("rc.4", "rc.5"))).text),
    ).toEqual({ kind: "up-to-date" });
    const intel = boot({ releases: twoReleases });
    expect(JSON.parse((await intel.call(LATEST.replace("arm64", "x64"))).text)).toMatchObject({
      kind: "unsupported",
    });
    expect(intel.seen).toEqual([]);
  });

  it("does not offer a release whose manifest names another file, size or version", async () => {
    for (const manifestText of [
      manifest("0.1.2-rc.5", SHA512, 1),
      manifest("0.1.2-rc.4"),
      "garbage",
    ]) {
      const result = JSON.parse(
        (await boot({ releases: twoReleases, manifestText }).call(LATEST)).text,
      );
      expect(result.kind).toBe("unreachable");
    }
  });

  it("refuses a download whose size is not the size the release lists", async () => {
    const { call } = boot({ releases: twoReleases, contentLength: "999999" });
    await call(LATEST);
    expect((await call("/api/t3team/nexi-update/asset?id=100")).status).toBe(502);
  });
});

describe("resolveNexiApiBase", () => {
  it("defaults to the fixed GHE host and takes an override only when it is loopback", () => {
    expect(resolveNexiApiBase({})).toBe("https://api.nexplore.ghe.com");
    expect(
      resolveNexiApiBase({ T3CODE_NEXI_UPDATE_API_BASE: "http://127.0.0.1:4555/api/v3/" }),
    ).toBe("http://127.0.0.1:4555/api/v3");
    for (const foreign of [
      "https://evil.example/api/v3",
      "http://evil.example:4555",
      "http://127.0.0.1.evil.example/",
      "file:///etc",
      "nonsense",
    ]) {
      expect(resolveNexiApiBase({ T3CODE_NEXI_UPDATE_API_BASE: foreign }), foreign).toBe(
        "https://api.nexplore.ghe.com",
      );
    }
  });
});
