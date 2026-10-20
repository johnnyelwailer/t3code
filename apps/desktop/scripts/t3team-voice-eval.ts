// Minimal WER / quality check for the desktop whisper transcriber.
//
//   pnpm -C apps/desktop exec vp pack                       # builds dist-electron/voice worker
//   node --experimental-strip-types apps/desktop/scripts/t3team-voice-eval.ts \
//     [--model-path <ggml.bin>] [--model large-v3-turbo] [--allow-download] [--only <lang>]
//
// Runs every clip in t3team-voice-eval-manifest.json through the real service, host and worker,
// prints transcript / WER / timing, and exits 1 when a language misses its WER threshold.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { makeDesktopVoiceService } from "../src/voice/t3team-voiceService.ts";
import { makeWhisperHost, type WhisperWorkerHandle } from "../src/voice/t3team-whisperHost.ts";
import { makeFileSentinel } from "../src/voice/t3team-whisperSentinel.ts";
import { computeWer } from "../src/voice/t3team-wer.ts";
import { wavToPcm16Base64 } from "./t3team-voice-eval-audio.ts";
import * as NodeChildProcess from "node:child_process";

type Clip = {
  readonly id: string;
  readonly language: string;
  readonly reference: string;
  readonly source:
    | { readonly kind: "url"; readonly url: string }
    | { readonly kind: "minds14"; readonly config: string; readonly row: number };
};
type Manifest = { readonly thresholds: Record<string, number>; readonly clips: readonly Clip[] };

const { values } = NodeUtil.parseArgs({
  options: {
    "model-path": { type: "string", default: "" },
    model: { type: "string", default: "large-v3-turbo" },
    "allow-download": { type: "boolean", default: false },
    only: { type: "string", default: "" },
  },
});

const scriptDir = import.meta.dirname;
const workerPath = NodePath.join(
  scriptDir,
  "..",
  "dist-electron",
  "voice",
  "t3team-whisperWorker.cjs",
);
const cacheDir = NodePath.join(NodeOS.tmpdir(), "t3team-voice-eval");
NodeFS.mkdirSync(cacheDir, { recursive: true });

async function fetchClipWav(clip: Clip): Promise<Buffer> {
  const cached = NodePath.join(cacheDir, `${clip.id}.wav`);
  if (NodeFS.existsSync(cached)) return NodeFS.readFileSync(cached);
  let url: string;
  if (clip.source.kind === "url") {
    url = clip.source.url;
  } else {
    const rows = await fetch(
      `https://datasets-server.huggingface.co/rows?dataset=PolyAI%2Fminds14&config=${clip.source.config}&split=train&offset=${clip.source.row}&length=1`,
    ).then((response) => response.json());
    url = rows.rows[0].row.audio[0].src;
  }
  const wav = Buffer.from(await (await fetch(url)).arrayBuffer());
  NodeFS.writeFileSync(cached, wav);
  return wav;
}

function forkWorker(): WhisperWorkerHandle {
  const child = NodeChildProcess.fork(workerPath, [], {
    execArgv: [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  return {
    send: (request) => child.send(request),
    onMessage: (listener) => child.on("message", listener),
    onExit: (listener) =>
      child.on("exit", (code, signal) => listener(`code=${code} signal=${signal}`)),
    kill: () => child.kill(),
  };
}

const manifest: Manifest = JSON.parse(
  NodeFS.readFileSync(NodePath.join(scriptDir, "t3team-voice-eval-manifest.json"), "utf8"),
);
const log = (message: string) => console.log(`  [voice] ${message}`);
const host = makeWhisperHost({
  spawnWorker: forkWorker,
  sentinel: makeFileSentinel(NodePath.join(cacheDir, "gpu-attempts.sentinel")),
  log,
});
const service = makeDesktopVoiceService({
  host,
  log,
  isRuntimeAvailable: () => NodeFS.existsSync(workerPath),
  environment: {
    env: process.env,
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone script, no Effect runtime.
    platform: process.platform,
    homeDir: NodeOS.homedir(),
    appDataDir: process.env.APPDATA ?? NodePath.join(NodeOS.homedir(), ".config"),
    appModelsDir: NodePath.join(cacheDir, "models"),
  },
});

async function main(): Promise<number> {
  const results = new Map<string, number[]>();
  for (const clip of manifest.clips.filter((c) => !values.only || c.language === values.only)) {
    const config = {
      model: values.model,
      modelPath: values["model-path"],
      language: clip.language,
    };
    const prepared = await service.prepare({ config, allowDownload: values["allow-download"] });
    if (!prepared.ok) throw new Error(`${prepared.code}: ${prepared.message}`);
    const result = await service.transcribe({
      config,
      pcm16Base64: wavToPcm16Base64(await fetchClipWav(clip)),
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    const wer = computeWer(clip.reference, result.text);
    results.set(clip.language, [...(results.get(clip.language) ?? []), wer]);
    console.log(
      `${clip.id} [${clip.language}] ${result.acceleration} ${result.elapsedMs}ms WER=${wer.toFixed(2)}\n  ref: ${clip.reference}\n  hyp: ${result.text.trim()}`,
    );
  }
  let failed = false;
  for (const [language, scores] of results) {
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const threshold = manifest.thresholds[language] ?? 1;
    const pass = mean <= threshold;
    failed ||= !pass;
    console.log(
      `${language}: mean WER ${mean.toFixed(3)} (threshold ${threshold}) ${pass ? "PASS" : "FAIL"}`,
    );
  }
  return failed ? 1 : 0;
}

main()
  .then((code) => {
    host.dispose();
    process.exit(code);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    host.dispose();
    process.exit(2);
  });
