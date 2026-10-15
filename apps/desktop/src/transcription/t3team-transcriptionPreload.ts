/**
 * Preload half of the desktop transcription bridge (side-effect import from preload.ts).
 * Exposes `window.t3teamTranscription`, consumed by the shared voice UI
 * (packages/shared/src/t3team-voiceInputUi/t3team-nativeRecognition.ts).
 */
import { contextBridge, ipcRenderer } from "electron";

import { TRANSCRIPTION_IPC, type TranscriptionEvent } from "./t3team-transcriptionProtocol.ts";

type Listener = (payload: { sessionId: string; event: TranscriptionEvent }) => void;

contextBridge.exposeInMainWorld("t3teamTranscription", {
  getStatus: (locale?: string) => ipcRenderer.invoke(TRANSCRIPTION_IPC.status, { locale }),
  start: (locale: string, engineId?: string) =>
    ipcRenderer.invoke(TRANSCRIPTION_IPC.start, { locale, engineId }),
  stop: (sessionId: string) => ipcRenderer.invoke(TRANSCRIPTION_IPC.stop, { sessionId }),
  abort: (sessionId: string) => ipcRenderer.invoke(TRANSCRIPTION_IPC.abort, { sessionId }),
  onEvent: (listener: Listener) => {
    const wrapped = (_event: unknown, payload: Parameters<Listener>[0]) => listener(payload);
    ipcRenderer.on(TRANSCRIPTION_IPC.event, wrapped);
    return () => {
      ipcRenderer.removeListener(TRANSCRIPTION_IPC.event, wrapped);
    };
  },
});
