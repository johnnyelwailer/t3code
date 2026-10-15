// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - build-time helper compile (swiftc/lipo) at the CLI boundary.
/**
 * Packaging for the desktop app's native speech-to-text helpers (see
 * apps/desktop/src/transcription/ and native/t3team-transcription/).
 *
 * - macOS: compiles native/t3team-transcription/t3team-transcribe.swift with the Xcode command line
 *   tools' swiftc (Speech + AVFoundation, both part of macOS) — per arch, lipo'd for universal.
 * - Windows: ships the PowerShell helper as-is (runs on the inbox Windows PowerShell 5.1).
 * - Linux: nothing (no OS speech engine; the composer mic stays hidden on Linux desktop).
 *
 * Output goes to `<stageResourcesDir>/transcription`, which the build copies to prod-resources and
 * electron-builder ships at `Resources/transcription`. `T3TEAM_SKIP_TRANSCRIPTION_HELPER=1` skips the
 * compile (the app then simply hides the desktop mic).
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const TRANSCRIPTION_EXTRA_RESOURCES = [
  { from: "apps/desktop/prod-resources/transcription", to: "transcription" },
] as const;

/** Staged once at Resources/transcription; keep the staging copies out of app.asar. */
export const TRANSCRIPTION_FILE_EXCLUSIONS = [
  "!apps/desktop/resources/transcription",
  "!apps/desktop/resources/transcription/**/*",
  "!apps/desktop/prod-resources/transcription",
  "!apps/desktop/prod-resources/transcription/**/*",
] as const;

/**
 * macOS privacy strings. The helper runs as a child of the app, so macOS attributes the microphone
 * and speech-recognition prompts to the app bundle — these keys must be in the app's Info.plist or
 * the helper is killed by TCC on first use.
 */
export const MAC_TRANSCRIPTION_USAGE_DESCRIPTIONS = {
  NSMicrophoneUsageDescription:
    "Voice input listens to your microphone while you dictate a message.",
  NSSpeechRecognitionUsageDescription:
    "Voice input uses macOS speech recognition to turn your dictation into text.",
} as const;

/** Hardened-runtime entitlement the signed app (and the helper, which inherits) needs for the mic. */
export const MAC_AUDIO_INPUT_ENTITLEMENT = "com.apple.security.device.audio-input";

const SWIFT_TARGETS: Record<string, string> = {
  arm64: "arm64-apple-macos12",
  x64: "x86_64-apple-macos12",
};

export function stageTranscriptionHelper(input: {
  readonly repoRoot: string;
  readonly stageResourcesDir: string;
  readonly platform: string;
  readonly arch: string;
  readonly log?: (message: string) => void;
}): void {
  const log = input.log ?? ((message: string) => console.log(message));
  const sourceDir = NodePath.join(input.repoRoot, "native", "t3team-transcription");
  const destination = NodePath.join(input.stageResourcesDir, "transcription");
  NodeFS.rmSync(destination, { recursive: true, force: true });
  NodeFS.mkdirSync(destination, { recursive: true });
  if (process.env.T3TEAM_SKIP_TRANSCRIPTION_HELPER === "1") {
    log(
      "[desktop-artifact] Skipping the transcription helper (T3TEAM_SKIP_TRANSCRIPTION_HELPER=1).",
    );
    return;
  }
  if (input.platform === "win") {
    NodeFS.copyFileSync(
      NodePath.join(sourceDir, "t3team-transcribe.ps1"),
      NodePath.join(destination, "t3team-transcribe.ps1"),
    );
    return;
  }
  if (input.platform !== "mac") return;
  const archs = input.arch === "universal" ? ["arm64", "x64"] : [input.arch];
  const outputs = archs.map((arch) => {
    const target = SWIFT_TARGETS[arch];
    if (!target) throw new Error(`No swift target for mac arch ${arch}`);
    const output = NodePath.join(destination, `t3team-transcribe-${arch}`);
    NodeChildProcess.execFileSync(
      "xcrun",
      [
        "swiftc",
        "-O",
        "-target",
        target,
        "-framework",
        "Speech",
        "-framework",
        "AVFoundation",
        NodePath.join(sourceDir, "t3team-transcribe.swift"),
        "-o",
        output,
      ],
      { stdio: "inherit" },
    );
    return output;
  });
  const final = NodePath.join(destination, "t3team-transcribe");
  if (outputs.length === 1) NodeFS.renameSync(outputs[0]!, final);
  else {
    NodeChildProcess.execFileSync("lipo", ["-create", ...outputs, "-output", final], {
      stdio: "inherit",
    });
    for (const output of outputs) NodeFS.rmSync(output, { force: true });
  }
  NodeFS.chmodSync(final, 0o755);
  log(`[desktop-artifact] Built the macOS transcription helper (${archs.join(", ")}).`);
}
