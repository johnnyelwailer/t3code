// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - reads one optional JSON file at startup.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { HelperProcessEngine } from "./t3team-helperProcessEngine.ts";
import type { TranscriptionEngine } from "./t3team-transcriptionEngine.ts";

/**
 * Optional `<userData>/t3team-transcription.json` — plug in your own model:
 *
 *   {
 *     "engine": "whisper-local",              // preferred engine id; omit for the OS default
 *     "engines": [
 *       { "id": "whisper-local", "label": "Local Whisper",
 *         "command": "/usr/local/bin/my-whisper-stream", "args": ["--model", "base"] }
 *     ]
 *   }
 *
 * A custom engine is any executable that speaks the JSON-lines protocol in
 * t3team-transcriptionProtocol.ts (`probe` / `listen --locale <code>`, "stop" on stdin). That covers
 * local models and HTTP endpoints alike (a small wrapper streams mic audio to the endpoint).
 * `T3TEAM_TRANSCRIPTION_ENGINE` overrides the preferred engine id.
 */
export interface TranscriptionConfig {
  readonly engine: string | null;
  readonly engines: ReadonlyArray<CustomEngineConfig>;
}

export interface CustomEngineConfig {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

export const TRANSCRIPTION_CONFIG_FILE = "t3team-transcription.json";

export function parseTranscriptionConfig(raw: unknown): TranscriptionConfig {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const engines = Array.isArray(obj.engines) ? obj.engines : [];
  return {
    engine: typeof obj.engine === "string" && obj.engine !== "native" ? obj.engine : null,
    engines: engines.flatMap((entry): CustomEngineConfig[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== "string" || typeof e.command !== "string" || !e.id || !e.command)
        return [];
      return [
        {
          id: e.id,
          label: typeof e.label === "string" ? e.label : e.id,
          command: e.command,
          args: Array.isArray(e.args)
            ? e.args.filter((a): a is string => typeof a === "string")
            : [],
        },
      ];
    }),
  };
}

export function loadTranscriptionConfig(
  userDataDir: string,
  env: Readonly<Record<string, string | undefined>>,
): TranscriptionConfig {
  let config: TranscriptionConfig = { engine: null, engines: [] };
  try {
    const text = NodeFS.readFileSync(NodePath.join(userDataDir, TRANSCRIPTION_CONFIG_FILE), "utf8");
    config = parseTranscriptionConfig(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[transcription] ignoring invalid ${TRANSCRIPTION_CONFIG_FILE}:`, String(error));
    }
  }
  const override = env.T3TEAM_TRANSCRIPTION_ENGINE;
  return override ? { ...config, engine: override === "native" ? null : override } : config;
}

export function createCustomEngines(config: TranscriptionConfig): TranscriptionEngine[] {
  return config.engines.map(
    (e) => new HelperProcessEngine(e.id, e.label, "custom", { command: e.command, args: e.args }),
  );
}
