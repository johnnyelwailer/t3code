// @effect-diagnostics nodeBuiltinImport:off -- Tests build a throwaway model directory on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makeDesktopVoiceService } from "./t3team-voiceService.ts";
import type { downloadWhisperModel } from "./t3team-whisperModelDownload.ts";
import type { WhisperHost } from "./t3team-whisperHost.ts";
import type { WhisperDeviceReport } from "./t3team-whisperVulkanDevices.ts";

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
    device?: WhisperDeviceReport;
  } = {},
) {
  const host: WhisperHost = {
    transcribe: vi.fn(async () => ({
      text: "hello",
      acceleration: "gpu" as const,
      device: "vulkan: test",
    })),
    warm: vi.fn(async () => undefined),
    probeDevice: vi.fn(async () => options.device ?? { kind: "cpu" as const, label: "cpu" }),
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

const config = { model: "large-v3-turbo", modelPath: "", language: "auto", silenceMs: 1500 };
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

  it("joins a download already running instead of starting a second writer, then retries after it ends", async () => {
    const { root } = sandbox();
    let finish: (path: string) => void = () => undefined;
    const { service, download } = makeService(root, {
      download: () => new Promise<string>((resolve) => (finish = resolve)),
    });

    const first = service.prepare({ config, allowDownload: true });
    const second = service.prepare({ config, allowDownload: true });
    finish(NodePath.join(root, "downloaded.bin"));

    expect(await first).toMatchObject({ ok: true, modelSource: "download" });
    expect(await second).toMatchObject({ ok: true, modelSource: "download" });
    expect(download).toHaveBeenCalledTimes(1);

    void service.prepare({ config, allowDownload: true });
    expect(download).toHaveBeenCalledTimes(2);
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

  it("warms the resolved model and stays silent when none is available", async () => {
    const { root, trackerDir } = sandbox();
    const missing = makeService(root);
    await missing.service.warm(config);
    expect(missing.host.warm).not.toHaveBeenCalled();

    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-largev3.bin"), modelBytes());
    const { service, host } = makeService(root);
    await service.warm(config);
    expect(host.warm).toHaveBeenCalledWith(NodePath.join(trackerDir, "ggml-largev3.bin"));
  });
});

describe("desktop voice service with no configured model", () => {
  const unset = { ...config, model: "" };
  const discrete: WhisperDeviceReport = {
    kind: "discrete",
    label: "vulkan: NVIDIA GeForce RTX 5070",
  };
  const integrated: WhisperDeviceReport = {
    kind: "integrated",
    label: "vulkan: Intel(R) Graphics",
  };
  const downloadedModels = (download: { mock: { calls: Array<[{ model: string }]> } }) =>
    download.mock.calls.map(([request]) => request.model);

  it("downloads base on an iGPU, probing with it", async () => {
    const { root } = sandbox();
    const { service, download, host } = makeService(root, { device: integrated });

    expect(await service.prepare({ config: unset, allowDownload: true })).toMatchObject({
      ok: true,
      modelSource: "download",
    });
    expect(downloadedModels(download)).toEqual(["base"]);
    expect(host.probeDevice).toHaveBeenCalledTimes(1);
  });

  it("downloads base when there is no GPU at all", async () => {
    const { root } = sandbox();
    const { service, download } = makeService(root);

    await service.prepare({ config: unset, allowDownload: true });

    expect(downloadedModels(download)).toEqual(["base"]);
  });

  it("steps up to the large tier on a discrete GPU", async () => {
    const { root } = sandbox();
    const { service, download } = makeService(root, { device: discrete });

    await service.prepare({ config: unset, allowDownload: true });

    expect(downloadedModels(download)).toEqual(["base", "large-v3-turbo"]);
  });

  it("uses a large model already on disk without probing or downloading", async () => {
    const { root, trackerDir } = sandbox();
    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-large-v3.bin"), modelBytes());
    const { service, download, host } = makeService(root, { device: integrated });

    expect(await service.prepare({ config: unset, allowDownload: true })).toMatchObject({
      ok: true,
      modelSource: "activity-tracker",
    });
    expect(download).not.toHaveBeenCalled();
    expect(host.probeDevice).not.toHaveBeenCalled();
  });

  it("reuses a base model on disk on an iGPU instead of downloading", async () => {
    const { root, trackerDir } = sandbox();
    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-base.bin"), modelBytes());
    const { service, download } = makeService(root, { device: integrated });

    expect(await service.prepare({ config: unset, allowDownload: true })).toMatchObject({
      ok: true,
      modelPath: NodePath.join(trackerDir, "ggml-base.bin"),
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("reports the large model as missing on a discrete GPU when downloads are not allowed", async () => {
    const { root, trackerDir } = sandbox();
    NodeFS.writeFileSync(NodePath.join(trackerDir, "ggml-base.bin"), modelBytes());
    const { service, download } = makeService(root, { device: discrete });

    expect(await service.prepare({ config: unset, allowDownload: false })).toMatchObject({
      ok: false,
      code: "model-unavailable",
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("never swaps a configured model for the machine default", async () => {
    const { root } = sandbox();
    const { service, download, host } = makeService(root, { device: integrated });

    await service.prepare({ config, allowDownload: true });

    expect(downloadedModels(download)).toEqual(["large-v3-turbo"]);
    expect(host.probeDevice).not.toHaveBeenCalled();
  });
});
