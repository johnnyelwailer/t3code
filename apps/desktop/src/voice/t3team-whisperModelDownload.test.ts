// @effect-diagnostics nodeBuiltinImport:off -- Tests download into a throwaway directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";

import type { DesktopVoiceModelProgress } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { makeProgressTap } from "./t3team-whisperDownloadProgress.ts";
import { downloadWhisperModel } from "./t3team-whisperModelDownload.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

async function pump(
  chunks: readonly number[],
  totalBytes: number | null,
): Promise<DesktopVoiceModelProgress[]> {
  const seen: DesktopVoiceModelProgress[] = [];
  await NodeStreamPromises.pipeline(
    NodeStream.Readable.from(chunks.map((size) => Buffer.alloc(size))),
    makeProgressTap(totalBytes, (progress) => seen.push(progress)),
    new NodeStream.Writable({ write: (_chunk, _encoding, done) => done() }),
  );
  return seen;
}

describe("makeProgressTap", () => {
  it("reports received bytes whenever another percent has arrived", async () => {
    expect(await pump([400, 400, 200], 1000)).toEqual([
      { receivedBytes: 400, totalBytes: 1000 },
      { receivedBytes: 800, totalBytes: 1000 },
      { receivedBytes: 1000, totalBytes: 1000 },
    ]);
  });

  it("does not report per chunk, only a final tally for what arrived below a step", async () => {
    const seen = await pump(
      Array.from({ length: 1000 }, () => 1),
      1_000_000,
    );
    expect(seen).toEqual([{ receivedBytes: 1000, totalBytes: 1_000_000 }]);
  });

  it("reports coarse byte steps and a final tally when the length is unknown", async () => {
    const seen = await pump([5 * 1024 * 1024, 5 * 1024 * 1024, 1024], null);
    expect(seen.map((progress) => progress.totalBytes)).toEqual([null, null]);
    expect(seen.map((progress) => progress.receivedBytes)).toEqual([
      10 * 1024 * 1024,
      10 * 1024 * 1024 + 1024,
    ]);
  });
});

describe("downloadWhisperModel progress", () => {
  it("forwards progress while the model streams to disk", async () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "whisper-download-"));
    roots.push(root);
    const body = new Blob([Buffer.alloc(300), Buffer.alloc(300), Buffer.alloc(400)]).stream();
    const fetchImpl: typeof fetch = async () =>
      new Response(body, { headers: { "content-length": "1000" } });
    const seen: DesktopVoiceModelProgress[] = [];

    const target = await downloadWhisperModel({
      model: "large-v3-turbo",
      targetDir: root,
      fetchImpl,
      onProgress: (progress) => seen.push(progress),
    });

    expect(NodeFS.statSync(target).size).toBe(1000);
    expect(seen.at(-1)).toEqual({ receivedBytes: 1000, totalBytes: 1000 });
    expect(seen.every((progress) => progress.totalBytes === 1000)).toBe(true);
  });
});
