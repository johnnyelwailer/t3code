// @effect-diagnostics nodeBuiltinImport:off -- Tests build a throwaway model directory on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makeDesktopVoiceService } from "./t3team-voiceService.ts";
import type { downloadWhisperModel } from "./t3team-whisperModelDownload.ts";
import type { WhisperHost } from "./t3team-whisperHost.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function sandbox() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "voice-service-"));
  roots.push(root);
  const trackerDir = NodePath.join(root, "tracker", "models", "whisper");
  NodeFS.mkdirSync(trackerDir, { recursive: true });
  return { root, trackerDir };
}

function makeService(
  root: string,
  options: {
    download?: typeof downloadWhisperModel;
    runtime?: boolean;
    onDownloadProgress?: () => void;
  } = {},
) {
  const host: WhisperHost = {
    transcribe: vi.fn(async () => ({ text: "hello", acceleration: "gpu" as const })),
    dispose: vi.fn(),
  };
  const download = vi.fn<typeof downloadWhisperModel>(
    options.download ?? (async () => NodePath.join(root, "downloaded.bin")),
  );
  return {
    host,
    download,
    service: makeDesktopVoiceService({
      host,
      isRuntimeAvailable: () => options.runtime ?? true,
      download,
      ...(options.onDownloadProgress ? { onDownloadProgress: options.onDownloadProgress } : {}),
      environment: {
        env: { ACTIVITY_TRACKER_DATA_DIR: NodePath.join(root, "tracker") },
        platform: "win32",
        homeDir: root,
        appDataDir: root,
        appModelsDir: NodePath.join(root, "own"),
      },
    }),
  };
}

const config = { model: "large-v3-turbo", modelPath: "", language: "auto" };
const modelBytes = () => Buffer.alloc(1_100_000);

describe("desktop voice service", () => {
  it("uses a model found on disk and never downloads", async () => {
    const { root, trackerDir } = sandbox();
    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-largev3.bin"), modelBytes());
    const { service, download } = makeService(root);

    const prepared = await service.prepare({ config, allowDownload: true });

    expect(prepared).toMatchObject({ ok: true, modelSource: "activity-tracker" });
    expect(download).not.toHaveBeenCalled();
  });

  it("lets an explicit modelPath win over anything detected", async () => {
    const { root, trackerDir } = sandbox();
    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-largev3.bin"), modelBytes());
    const explicit = NodePath.join(root, "mine.bin");
    NodeFS.writeFileSync(explicit, "x");
    const { service } = makeService(root);

    expect(
      await service.prepare({ config: { ...config, modelPath: explicit }, allowDownload: true }),
    ).toEqual({ ok: true, modelPath: explicit, modelSource: "setting" });
    expect(
      await service.prepare({
        config: { ...config, modelPath: NodePath.join(root, "nope.bin") },
        allowDownload: true,
      }),
    ).toMatchObject({ ok: false, code: "model-unavailable" });
  });

  it("downloads only as a fallback and only when allowed", async () => {
    const { root } = sandbox();
    const { service, download } = makeService(root);

    expect(await service.prepare({ config, allowDownload: false })).toMatchObject({
      ok: false,
      code: "model-unavailable",
    });
    expect(download).not.toHaveBeenCalled();

    expect(await service.prepare({ config, allowDownload: true })).toMatchObject({
      ok: true,
      modelSource: "download",
    });
    expect(download).toHaveBeenCalledWith({
      model: "large-v3-turbo",
      targetDir: NodePath.join(root, "own"),
    });
  });

  it("hands the download a progress listener only when one is configured", async () => {
    const { root } = sandbox();
    const onDownloadProgress = vi.fn();
    const { service, download } = makeService(root, { onDownloadProgress });

    await service.prepare({ config, allowDownload: true });

    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress: onDownloadProgress }),
    );
  });

  it("turns a failed download into a clear model-unavailable error", async () => {
    const { root } = sandbox();
    const { service } = makeService(root, {
      download: async () => {
        throw new Error("No whisper model was found and downloading failed: HTTP 503");
      },
    });

    expect(await service.prepare({ config, allowDownload: true })).toEqual({
      ok: false,
      code: "model-unavailable",
      message: "No whisper model was found and downloading failed: HTTP 503",
    });
  });

  it("reports a missing runtime and transcribes through the host", async () => {
    const { root, trackerDir } = sandbox();
    expect(
      await makeService(root, { runtime: false }).service.prepare({ config, allowDownload: true }),
    ).toMatchObject({ ok: false, code: "runtime-unavailable" });

    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-largev3.bin"), modelBytes());
    const { service, host } = makeService(root);
    const result = await service.transcribe({ config, pcm16Base64: "AAAA" });

    expect(result).toMatchObject({ ok: true, text: "hello", acceleration: "gpu" });
    expect(host.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ pcm16Base64: "AAAA", language: "auto" }),
    );
  });
});
