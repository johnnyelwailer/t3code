import { describe, expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as CursorKeychain from "./CursorKeychain.ts";
import { cursorUsageResponseToLimits, readCursorUsageLimits } from "./usageLimits.ts";

const withNodeServices = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | CursorKeychain.CursorKeychain>,
  accessToken: CursorKeychain.CursorKeychain["Service"]["accessToken"] = Effect.die(
    "must not read Keychain",
  ),
) =>
  effect.pipe(
    Effect.provideService(CursorKeychain.CursorKeychain, { accessToken }),
    Effect.provide(NodeServices.layer),
  );

describe("Cursor usage limits", () => {
  const checkedAt = "2026-09-16T00:00:00.000Z";

  it("uses the advertised percentages and billing-cycle reset", () => {
    const limits = cursorUsageResponseToLimits(
      {
        billingCycleEnd: "1789876386000",
        planUsage: { totalPercentUsed: 72.4, autoPercentUsed: 69.5, apiPercentUsed: 100 },
      },
      checkedAt,
    );
    expect(limits.windows).toEqual(
      expect.arrayContaining([
        {
          id: "totalPercentUsed",
          kind: "monthly",
          label: "Overall",
          usedPercent: 72.4,
          resetsAt: "2026-09-20T03:53:06.000Z",
        },
        {
          id: "autoPercentUsed",
          kind: "monthly",
          label: "Cursor Models",
          usedPercent: 69.5,
          resetsAt: "2026-09-20T03:53:06.000Z",
        },
        {
          id: "apiPercentUsed",
          kind: "monthly",
          label: "Other Models",
          usedPercent: 100,
          resetsAt: "2026-09-20T03:53:06.000Z",
        },
      ]),
    );
  });

  it("does not invent unused allowance for absent buckets", () => {
    expect(cursorUsageResponseToLimits({ planUsage: {} }, checkedAt).unavailable?.reason).toBe(
      "unsupported",
    );
    expect(
      cursorUsageResponseToLimits({ planUsage: { totalPercentUsed: 0 } }, checkedAt).windows,
    ).toEqual([{ id: "totalPercentUsed", kind: "monthly", label: "Overall", usedPercent: 0 }]);
    expect(
      cursorUsageResponseToLimits({ planUsage: { totalPercentUsed: 150 } }, checkedAt).windows,
    ).toEqual([{ id: "totalPercentUsed", kind: "monthly", label: "Overall", usedPercent: 100 }]);
  });

  it.effect("reads the instance's credentials and endpoint even when usage enabled is false", () =>
    withNodeServices(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(directory, "cursor"));
        yield* fs.writeFileString(
          path.join(directory, "cursor", "auth.json"),
          '{"accessToken":"instance-token"}',
        );
        const client = HttpClient.make((request) => {
          expect(request.url).toBe(
            "https://cursor.example/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
          );
          expect(request.method).toBe("POST");
          expect(request.headers.authorization).toBe("Bearer instance-token");
          expect(request.headers["connect-protocol-version"]).toBe("1");
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ enabled: false, planUsage: { totalPercentUsed: 42 } }),
            ),
          );
        });
        yield* fs.makeDirectory(path.join(directory, ".cursor"));
        yield* fs.writeFileString(
          path.join(directory, ".cursor", "auth.json"),
          '{"accessToken":"instance-token"}',
        );
        for (const platform of ["linux", "darwin"] as const) {
          const limits = yield* readCursorUsageLimits(
            { apiEndpoint: "https://cursor.example/" },
            { XDG_CONFIG_HOME: directory, HOME: directory, AGENT_CLI_CREDENTIAL_STORE: "file" },
          ).pipe(
            Effect.provideService(HostProcess.Platform, platform),
            Effect.provideService(HttpClient.HttpClient, client),
          );
          expect(limits.windows[0]?.usedPercent).toBe(42);
        }
      }).pipe(Effect.scoped),
    ),
  );

  it.effect(
    "never reads stale files for keychain or memory logins, but accepts an explicit auth token",
    () =>
      Effect.gen(function* () {
        for (const platform of ["linux", "darwin"] as const) {
          for (const token of [undefined, "explicit-token"]) {
            const limits = yield* withNodeServices(
              readCursorUsageLimits(
                { apiEndpoint: "" },
                {
                  AGENT_CLI_CREDENTIAL_STORE: platform === "linux" ? "memory" : "default",
                  ...(token ? { CURSOR_AUTH_TOKEN: token } : {}),
                },
                false,
              ).pipe(
                Effect.provideService(HostProcess.Platform, platform),
                Effect.provideService(
                  FileSystem.FileSystem,
                  FileSystem.makeNoop({
                    readFileString: () => Effect.die("must not read an unrelated credential file"),
                  }),
                ),
                Effect.provideService(
                  HttpClient.HttpClient,
                  HttpClient.make((request) => {
                    expect(token).toBe("explicit-token");
                    expect(request.headers.authorization).toBe("Bearer explicit-token");
                    return Effect.succeed(
                      HttpClientResponse.fromWeb(
                        request,
                        Response.json({ planUsage: { totalPercentUsed: 10 } }),
                      ),
                    );
                  }),
                ),
              ),
            );
            if (token) expect(limits.windows[0]?.usedPercent).toBe(10);
            else expect(limits.unavailable?.reason).toBe("unsupported");
          }
        }
      }),
  );

  it.effect(
    "reads the Windows login from %APPDATA%\\Cursor\\auth.json, as the Cursor CLI does",
    () =>
      Effect.gen(function* () {
        yield* withNodeServices(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const home = yield* fs.makeTempDirectoryScoped();
            const appData = path.join(home, "AppData", "Roaming");
            yield* fs.makeDirectory(path.join(appData, "Cursor"), { recursive: true });
            yield* fs.writeFileString(
              path.join(appData, "Cursor", "auth.json"),
              '{"accessToken":"windows-cli-token","refreshToken":"unused"}',
            );
            yield* fs.makeDirectory(path.join(home, ".cursor"));
            yield* fs.writeFileString(
              path.join(home, ".cursor", "auth.json"),
              '{"accessToken":"macos-style-token"}',
            );
            const client = HttpClient.make((request) => {
              expect(request.headers.authorization).toBe("Bearer windows-cli-token");
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json({ planUsage: { totalPercentUsed: 61 } }),
                ),
              );
            });
            const limits = yield* readCursorUsageLimits(
              { apiEndpoint: "" },
              { APPDATA: appData, USERPROFILE: home },
            ).pipe(
              Effect.provideService(HostProcess.Platform, "win32"),
              Effect.provideService(HttpClient.HttpClient, client),
            );
            expect(limits.windows[0]?.usedPercent).toBe(61);
          }).pipe(Effect.scoped),
        );
      }),
  );

  describe("failed requests name their cause without exposing credentials or response bodies", () => {
    const failWith = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) =>
      withNodeServices(
        readCursorUsageLimits({ apiEndpoint: "" }, { CURSOR_AUTH_TOKEN: "private-token" }).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.succeed(HttpClientResponse.fromWeb(request, respond(request))),
            ),
          ),
        ),
      );

    it.effect("tells the user to sign in again when Cursor rejects the login", () =>
      Effect.gen(function* () {
        for (const status of [401, 403]) {
          const limits = yield* failWith(() => new Response("private response", { status }));
          expect(limits.unavailable).toEqual({
            reason: "probeFailed",
            message:
              "Cursor rejected the saved login (it may have expired). Run `agent login` to sign in again.",
          });
        }
      }),
    );

    it.effect("reports the HTTP status of other failures", () =>
      Effect.gen(function* () {
        const limits = yield* failWith(() => new Response("private response", { status: 503 }));
        expect(limits.unavailable).toEqual({
          reason: "probeFailed",
          message: "Cursor usage request failed (HTTP 503).",
        });
      }),
    );

    it.effect("reports an unreachable Cursor host", () =>
      Effect.gen(function* () {
        const limits = yield* withNodeServices(
          readCursorUsageLimits({ apiEndpoint: "" }, { CURSOR_AUTH_TOKEN: "private-token" }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.make((request) =>
                Effect.fail(
                  new HttpClientError.HttpClientError({
                    reason: new HttpClientError.TransportError({ request, cause: "private" }),
                  }),
                ),
              ),
            ),
          ),
        );
        expect(limits.unavailable).toEqual({
          reason: "probeFailed",
          message: "Could not reach Cursor to read usage limits.",
        });
      }),
    );
  });

  it.effect("does not use a stored login for an explicit API key", () =>
    Effect.gen(function* () {
      const limits = yield* withNodeServices(
        readCursorUsageLimits({ apiEndpoint: "" }, { CURSOR_API_KEY: "different-account" }).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("must not request usage")),
          ),
        ),
      );
      expect(limits.unavailable?.reason).toBe("unsupported");
    }),
  );

  it.effect("reads the default macOS Cursor login from Keychain for limits", () =>
    Effect.gen(function* () {
      const limits = yield* withNodeServices(
        readCursorUsageLimits({ apiEndpoint: "" }, {}, true).pipe(
          Effect.provideService(HostProcess.Platform, "darwin"),
          Effect.provideService(
            FileSystem.FileSystem,
            FileSystem.makeNoop({
              readFileString: () => Effect.die("must not read a stale credential file"),
            }),
          ),
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              expect(request.headers.authorization).toBe("Bearer keychain-token");
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json({ planUsage: { totalPercentUsed: 42 } }),
                ),
              );
            }),
          ),
        ),
        Effect.succeed("keychain-token"),
      );
      expect(limits.windows[0]?.usedPercent).toBe(42);
    }),
  );

  it.effect("reports a Keychain initialization failure without failing the provider refresh", () =>
    Effect.gen(function* () {
      const limits = yield* withNodeServices(
        readCursorUsageLimits({ apiEndpoint: "" }, {}, true).pipe(
          Effect.provideService(HostProcess.Platform, "darwin"),
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("must not request limits without a login")),
          ),
        ),
        Effect.fail(
          new CursorKeychain.CursorKeychainReadError({
            cause: new Error("Keychain initialization failed"),
          }),
        ),
      );
      expect(limits.unavailable?.reason).toBe("probeFailed");
    }),
  );

  it.effect("does not read Keychain or send its token to a custom endpoint", () =>
    Effect.gen(function* () {
      for (const [apiEndpoint, environment] of [
        ["http://localhost:3000", {}],
        ["", { CURSOR_API_ENDPOINT: "http://localhost:3000" }],
        ["https://cursor-proxy.example", {}],
        ["", { CURSOR_API_ENDPOINT: "https://cursor-proxy.example" }],
      ] as const) {
        const limits = yield* withNodeServices(
          readCursorUsageLimits({ apiEndpoint }, environment, true).pipe(
            Effect.provideService(HostProcess.Platform, "darwin"),
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.make(() => Effect.die("must not send a Keychain credential to a proxy")),
            ),
          ),
        );
        expect(limits.unavailable?.reason).toBe("unsupported");
        expect(limits.unavailable?.message).toContain("default Cursor endpoint");
      }
    }),
  );
});
