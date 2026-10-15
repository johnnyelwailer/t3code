// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - plain Electron bootstrap outside the Effect runtime.
/**
 * Desktop transcription bootstrap (side-effect import from main.ts): builds the engine registry —
 * OS-native engines first, then custom engines from `<userData>/t3team-transcription.json` — and
 * exposes it over IPC to the preload bridge (t3team-transcriptionPreload.ts).
 */
import * as NodePath from "node:path";

import * as Electron from "electron";

import { createCustomEngines, loadTranscriptionConfig } from "./t3team-transcriptionConfig.ts";
import { installTranscriptionIpc } from "./t3team-transcriptionIpc.ts";
import { createNativeEngines } from "./t3team-nativeEngines.ts";
import { TranscriptionRegistry } from "./t3team-transcriptionRegistry.ts";

export function createDesktopTranscriptionRegistry(): TranscriptionRegistry {
  const registry = new TranscriptionRegistry();
  const env = process.env;
  const native = createNativeEngines({
    // oxlint-disable-next-line t3code/no-global-process-runtime -- plain Electron bootstrap outside the Effect runtime.
    platform: process.platform,
    resourcesPath: Electron.app.isPackaged ? process.resourcesPath : undefined,
    // dist-electron/ sits two levels below the repo root's apps/desktop.
    devRoot: Electron.app.isPackaged ? undefined : NodePath.resolve(__dirname, "../../.."),
    env,
  });
  for (const engine of native) registry.register(engine);
  const config = loadTranscriptionConfig(Electron.app.getPath("userData"), env);
  for (const engine of createCustomEngines(config)) registry.register(engine);
  registry.setPreferred(config.engine);
  return registry;
}

void Electron.app.whenReady().then(() => {
  try {
    installTranscriptionIpc(Electron.ipcMain, createDesktopTranscriptionRegistry());
  } catch (error) {
    console.warn("[transcription] failed to install the transcription bridge:", error);
  }
});
