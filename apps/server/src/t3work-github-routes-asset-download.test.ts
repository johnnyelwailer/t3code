import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import type { VcsProcessOutput, VcsProcessShape } from "./t3work-vcsProcessShape.ts";
import { downloadGitHubAsset } from "./t3work-github-routes-asset-download.ts";

function processOutput(stdout: string): VcsProcessOutput {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

describe("downloadGitHubAsset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads GitHub-hosted assets with a gh auth token when available", async () => {
    const run = vi.fn<VcsProcessShape["run"]>(() => Effect.succeed(processOutput("gh-token\n")));
    const httpClient = HttpClient.make((request) => {
      expect(request.headers).toMatchObject({
        accept: "*/*",
        authorization: "Bearer gh-token",
      });

      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(Uint8Array.from([137, 80, 78, 71]), {
            status: 200,
            headers: {
              "content-type": "image/png",
            },
          }),
        ),
      );
    });

    const result = await Effect.runPromise(
      downloadGitHubAsset(
        { run },
        {
          host: "github.com",
          url: "https://private-user-images.githubusercontent.com/assets/example.png",
        },
      ).pipe(Effect.provideService(HttpClient.HttpClient, httpClient)),
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(4);
    expect(result.base64Contents).toBe(Buffer.from([137, 80, 78, 71]).toString("base64"));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
