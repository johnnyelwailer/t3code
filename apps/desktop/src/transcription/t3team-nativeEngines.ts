// @effect-diagnostics nodeBuiltinImport:off - resolves helper paths synchronously at startup.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { HelperProcessEngine, type Spawn } from "./t3team-helperProcessEngine.ts";
import type { TranscriptionEngine } from "./t3team-transcriptionEngine.ts";

export const MAC_HELPER = "t3team-transcribe";
export const WINDOWS_HELPER = "t3team-transcribe.ps1";

export interface NativeEngineContext {
  readonly platform: NodeJS.Platform;
  /** Electron `process.resourcesPath` (packaged helpers live in `<resources>/transcription`). */
  readonly resourcesPath: string | undefined;
  /** Repository root in development (helpers under `native/t3team-transcription`). */
  readonly devRoot: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly exists?: (path: string) => boolean;
  readonly spawn?: Spawn;
}

/** Locate the helper: explicit override, packaged resources, then the dev checkout. */
export function resolveHelperPath(name: string, ctx: NativeEngineContext): string | undefined {
  const exists = ctx.exists ?? NodeFS.existsSync;
  const candidates = [
    ctx.env.T3TEAM_TRANSCRIBE_HELPER,
    ctx.resourcesPath && NodePath.join(ctx.resourcesPath, "transcription", name),
    ctx.devRoot && NodePath.join(ctx.devRoot, "native", "t3team-transcription", "build", name),
    ctx.devRoot && NodePath.join(ctx.devRoot, "native", "t3team-transcription", name),
  ];
  return candidates.find((candidate): candidate is string => !!candidate && exists(candidate));
}

/**
 * The built-in OS engines. Both ship with the OS — nothing is downloaded:
 * - macOS: Speech framework (SFSpeechRecognizer, on-device when the locale supports it)
 * - Windows: Windows.Media.SpeechRecognition dictation, falling back to offline System.Speech
 *   dictation when "Online speech recognition" is off, via inbox Windows PowerShell 5.1.
 */
export function createNativeEngines(ctx: NativeEngineContext): TranscriptionEngine[] {
  if (ctx.platform === "darwin") {
    const helper = resolveHelperPath(MAC_HELPER, ctx);
    if (!helper) return [];
    return [
      new HelperProcessEngine(
        "macos-speech",
        "macOS Speech",
        "native",
        { command: helper },
        ctx.spawn,
      ),
    ];
  }
  if (ctx.platform === "win32") {
    const script = resolveHelperPath(WINDOWS_HELPER, ctx);
    if (!script) return [];
    const systemRoot = ctx.env.SystemRoot ?? ctx.env.SYSTEMROOT ?? "C:\\Windows";
    return [
      new HelperProcessEngine(
        "windows-speech",
        "Windows Speech",
        "native",
        {
          command: NodePath.win32.join(
            systemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
          protocolArgs: (mode, locale) => (locale ? [mode, "-Locale", locale] : [mode]),
        },
        ctx.spawn,
      ),
    ];
  }
  return [];
}
