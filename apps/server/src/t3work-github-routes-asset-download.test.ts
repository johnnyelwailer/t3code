import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { VcsProcessOutput, VcsProcessShape } from "./vcs/VcsProcess.ts";
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
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Accept: "*/*",
        Authorization: "Bearer gh-token",
      });
      return new Response(Uint8Array.from([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const run = vi.fn<VcsProcessShape["run"]>(() => Effect.succeed(processOutput("gh-token\n")));

    const result = await Effect.runPromise(
      downloadGitHubAsset(
        { run },
        {
          host: "github.com",
          url: "https://private-user-images.githubusercontent.com/assets/example.png",
        },
      ),
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(4);
    expect(result.base64Contents).toBe(Buffer.from([137, 80, 78, 71]).toString("base64"));
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
