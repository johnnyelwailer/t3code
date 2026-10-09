import * as Effect from "effect/Effect";
import { it } from "@effect/vitest";
import { describe, expect } from "vite-plus/test";

import type { GitLabCli } from "../sourceControl/GitLabCli.ts";
import { readGitLabFileAtRevision } from "./t3team-GitLabFileAtRevision.ts";

const SHA = "a".repeat(40);

const request = (maxBytes: number) => ({
  cwd: "/repo",
  repository: "acme/web",
  host: "gitlab.example.com",
  revision: SHA,
  path: "src/index.ts",
  maxBytes,
});

/** A glab that records its arguments and answers with `stdout`. */
const fakeGitLab = (stdout: string) => {
  const calls: Array<{ args: ReadonlyArray<string>; maxOutputBytes?: number | undefined }> = [];
  const service = {
    execute: (input: { args: ReadonlyArray<string>; maxOutputBytes?: number | undefined }) => {
      calls.push(input);
      return Effect.succeed({ stdout, stderr: "", code: 0, stdoutTruncated: false });
    },
  } as unknown as GitLabCli["Service"];
  return { calls, service };
};

describe("readGitLabFileAtRevision", () => {
  it.effect("sends a content read to the linked host", () =>
    Effect.gen(function* () {
      const body = JSON.stringify({
        blob_id: "b1",
        size: 5,
        encoding: "base64",
        content: Buffer.from("hello").toString("base64"),
      });
      const { calls, service } = fakeGitLab(body);
      const file = yield* readGitLabFileAtRevision(service, request(1000));
      expect(calls).toHaveLength(1);
      expect(calls[0]!.args.slice(0, 3)).toEqual(["api", "--hostname", "gitlab.example.com"]);
      expect(calls[0]!.args).not.toContain("HEAD");
      expect(file).toMatchObject({ blobSha: "b1", size: 5 });
      expect(Buffer.from(file!.content!).toString()).toBe("hello");
    }),
  );

  it.effect("reads only the blob id and size, from headers, when no content is wanted", () =>
    Effect.gen(function* () {
      const { calls, service } = fakeGitLab(
        "HTTP/2.0 200 OK\r\nX-Gitlab-Blob-Id: b2\r\nX-Gitlab-Size: 4096\r\nContent-Type: text/plain\r\n\r\n",
      );
      const file = yield* readGitLabFileAtRevision(service, request(0));
      expect(calls[0]!.args).toEqual([
        "api",
        "--hostname",
        "gitlab.example.com",
        "--method",
        "HEAD",
        "--include",
        expect.stringContaining("/repository/files/src%2Findex.ts?ref="),
      ]);
      expect(calls[0]!.maxOutputBytes).toBeLessThan(64 * 1024);
      expect(file).toEqual({ blobSha: "b2", size: 4096, content: null });
    }),
  );

  it.effect("does not understand a HEAD answer without a blob id", () =>
    Effect.gen(function* () {
      const { service } = fakeGitLab("HTTP/2.0 200 OK\r\nX-Gitlab-Size: 4\r\n\r\n");
      const file = yield* readGitLabFileAtRevision(service, request(0));
      expect(file).toBeUndefined();
    }),
  );
});
