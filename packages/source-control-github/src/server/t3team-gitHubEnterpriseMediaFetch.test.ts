import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubEnterpriseMediaFetch from "./t3team-gitHubEnterpriseMediaFetch.ts";

const SIGNED =
  "https://objects-origin.nexplore.ghe.com/user-asset/16605232-3952be71.png?X-Amz-Signature=s&amp;X-Amz-Date=d";

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body?: string;
}

function harness(signedIn: ReadonlySet<string>, respond: (url: URL) => Response) {
  const sent: Array<Sent> = [];
  const looked: Array<string> = [];
  const credentials = Layer.mock(GitHubCredentials.GitHubCredentials)({
    get: (host) => {
      looked.push(host);
      return signedIn.has(host)
        ? Effect.succeed({
            host,
            token: Redacted.make(`${host}-token`),
            source: "gh" as const,
            fingerprint: "fingerprint",
          })
        : Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host }));
    },
  });
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const body =
        request.body._tag === "Uint8Array"
          ? new TextDecoder().decode(request.body.body)
          : undefined;
      sent.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        ...(body === undefined ? {} : { body }),
      });
      return HttpClientResponse.fromWeb(request, respond(new URL(request.url)));
    }),
  );
  const run = (url: string) =>
    Effect.gen(function* () {
      const fetchMedia = yield* GitHubEnterpriseMediaFetch.make;
      return yield* fetchMedia({ url, headers: {} });
    }).pipe(
      Effect.provide(credentials),
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.scoped,
    );
  return { sent, looked, run };
}

const png = () => new Response("png", { status: 200, headers: { "content-type": "image/png" } });

describe("GitHubMediaFetch on GitHub Enterprise hosts", () => {
  it.effect("fetches a committed file with the token of the file's own host", () => {
    const { sent, looked, run } = harness(new Set(["nexplore.ghe.com", "github.com"]), png);
    return Effect.gen(function* () {
      const response = yield* run("https://raw.nexplore.ghe.com/hive/nx-nexi/main/shot.png");
      expect(response?.status).toBe(200);
      expect(looked).toEqual(["nexplore.ghe.com"]);
      expect(sent).toEqual([
        {
          method: "GET",
          url: "https://raw.nexplore.ghe.com/hive/nx-nexi/main/shot.png",
          authorization: "Bearer nexplore.ghe.com-token",
        },
      ]);
    });
  });

  it.effect("refuses a host no credential is configured for, without fetching", () => {
    const { sent, run } = harness(new Set(["github.com"]), png);
    return Effect.gen(function* () {
      expect(yield* run("https://raw.other.ghe.com/o/r/main/shot.png")).toBeNull();
      expect(yield* run("https://other.ghe.com/user-attachments/assets/1a1842fb")).toBeNull();
      expect(sent).toEqual([]);
    });
  });

  it.effect("follows a redirect only within the host, and never with its token", () => {
    const { sent, run } = harness(new Set(["nexplore.ghe.com"]), (url) =>
      url.pathname.endsWith("away.png")
        ? new Response(null, { status: 302, headers: { location: "https://evil.example/x.png" } })
        : url.hostname === "raw.nexplore.ghe.com"
          ? new Response(null, {
              status: 302,
              headers: { location: "https://objects-origin.nexplore.ghe.com/signed.png" },
            })
          : png(),
    );
    return Effect.gen(function* () {
      expect((yield* run("https://raw.nexplore.ghe.com/o/r/main/a.png"))?.status).toBe(200);
      expect(yield* run("https://raw.nexplore.ghe.com/o/r/main/away.png")).toBeNull();
      expect(sent.map(({ url, authorization }) => [new URL(url).hostname, authorization])).toEqual([
        ["raw.nexplore.ghe.com", "Bearer nexplore.ghe.com-token"],
        ["objects-origin.nexplore.ghe.com", undefined],
        ["raw.nexplore.ghe.com", "Bearer nexplore.ghe.com-token"],
      ]);
    });
  });

  it.effect(
    "signs an upload through the host's API and follows it to the store without the token",
    () => {
      const { sent, run } = harness(new Set(["nexplore.ghe.com"]), (url) =>
        url.pathname === "/user/repos"
          ? Response.json([{ full_name: "hive/nx-nexi" }])
          : url.pathname === "/markdown"
            ? new Response(`<p><a href="x"><img src="${SIGNED}" alt="x"></a></p>`)
            : url.hostname === "objects-origin.nexplore.ghe.com"
              ? new Response(null, {
                  status: 307,
                  headers: { location: "https://store.blob.core.windows.net/a.png?sig=s" },
                })
              : png(),
      );
      return Effect.gen(function* () {
        const response = yield* run(
          "https://nexplore.ghe.com/user-attachments/assets/3952be71-42e8-44d1-bd5b-ed2fe719d3f2",
        );
        expect(response?.status).toBe(200);
        expect(sent.map(({ method, url, authorization }) => [method, url, authorization])).toEqual([
          [
            "GET",
            "https://api.nexplore.ghe.com/user/repos?per_page=1&sort=pushed",
            "Bearer nexplore.ghe.com-token",
          ],
          ["POST", "https://api.nexplore.ghe.com/markdown", "Bearer nexplore.ghe.com-token"],
          [
            "GET",
            "https://objects-origin.nexplore.ghe.com/user-asset/16605232-3952be71.png?X-Amz-Signature=s&X-Amz-Date=d",
            undefined,
          ],
          ["GET", "https://store.blob.core.windows.net/a.png?sig=s", undefined],
        ]);
        expect(JSON.parse(sent[1]?.body ?? "{}")).toEqual({
          mode: "gfm",
          context: "hive/nx-nexi",
          text: "![](https://nexplore.ghe.com/user-attachments/assets/3952be71-42e8-44d1-bd5b-ed2fe719d3f2)",
        });
      });
    },
  );

  it.effect("refuses a signed URL that leaves the enterprise host", () => {
    const { sent, run } = harness(new Set(["nexplore.ghe.com"]), (url) =>
      url.pathname === "/markdown" ? new Response('<img src="https://evil.example/a.png">') : png(),
    );
    return Effect.gen(function* () {
      expect(
        yield* run("https://nexplore.ghe.com/hive/nx-nexi/assets/45952064/1a1842fb"),
      ).toBeNull();
      expect(sent.map(({ url }) => new URL(url).hostname)).toEqual(["api.nexplore.ghe.com"]);
    });
  });

  it.effect("still reads github.com media with the github.com token", () => {
    const { sent, looked, run } = harness(new Set(["nexplore.ghe.com", "github.com"]), png);
    return Effect.gen(function* () {
      yield* run("https://raw.githubusercontent.com/o/r/main/a.png");
      expect(looked).toEqual(["github.com"]);
      expect(sent[0]?.authorization).toBe("Bearer github.com-token");
    });
  });
});
