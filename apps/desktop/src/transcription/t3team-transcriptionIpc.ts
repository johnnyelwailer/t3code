import type { TranscriptionSession } from "./t3team-transcriptionEngine.ts";
import type { TranscriptionRegistry } from "./t3team-transcriptionRegistry.ts";
import { TRANSCRIPTION_IPC, type TranscriptionEvent } from "./t3team-transcriptionProtocol.ts";

/** The slice of Electron's ipcMain / WebContents this module needs (keeps it unit-testable). */
export interface TranscriptionIpcSender {
  readonly id: number;
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
  once(event: "destroyed", listener: () => void): void;
}
export interface TranscriptionIpcMain {
  handle(
    channel: string,
    listener: (event: { readonly sender: TranscriptionIpcSender }, raw: unknown) => unknown,
  ): void;
  removeHandler(channel: string): void;
}

interface LiveSession {
  readonly session: TranscriptionSession;
  readonly ownerId: number;
}

const str = (raw: unknown, key: string): string | undefined => {
  const value =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && value.length > 0 && value.length < 200 ? value : undefined;
};

/** Wire the registry to IPC. Returns a disposer that aborts live sessions and removes handlers. */
export function installTranscriptionIpc(
  ipcMain: TranscriptionIpcMain,
  registry: TranscriptionRegistry,
) {
  const sessions = new Map<string, LiveSession>();
  const watched = new Set<number>();
  let nextId = 1;

  const abortOwnedBy = (ownerId: number) => {
    for (const [id, live] of sessions) {
      if (live.ownerId === ownerId) {
        sessions.delete(id);
        live.session.abort();
      }
    }
  };

  ipcMain.handle(TRANSCRIPTION_IPC.status, (_event, raw) => registry.status(str(raw, "locale")));

  ipcMain.handle(TRANSCRIPTION_IPC.start, async (event, raw) => {
    const locale = str(raw, "locale") ?? "en-US";
    const requested = str(raw, "engineId");
    const engineId = requested ?? (await registry.status(locale)).engineId;
    const engine = engineId ? registry.get(engineId) : undefined;
    if (!engine) {
      return {
        ok: false as const,
        code: "unavailable",
        message: "No speech-to-text engine is available on this computer.",
      };
    }
    const sessionId = `t${nextId++}`;
    const sender = event.sender;
    if (!watched.has(sender.id)) {
      watched.add(sender.id);
      sender.once("destroyed", () => {
        watched.delete(sender.id);
        abortOwnedBy(sender.id);
      });
    }
    const forward = (payload: TranscriptionEvent) => {
      if (payload.type === "end") sessions.delete(sessionId);
      if (!sender.isDestroyed())
        sender.send(TRANSCRIPTION_IPC.event, { sessionId, event: payload });
    };
    const session = engine.start({ locale, onEvent: forward });
    sessions.set(sessionId, { session, ownerId: sender.id });
    return { ok: true as const, sessionId, engineId: engine.id };
  });

  const control =
    (kind: "stop" | "abort") =>
    (event: { readonly sender: TranscriptionIpcSender }, raw: unknown) => {
      const id = str(raw, "sessionId");
      const live = id ? sessions.get(id) : undefined;
      if (!live || live.ownerId !== event.sender.id) return false;
      if (kind === "abort") sessions.delete(id!);
      live.session[kind]();
      return true;
    };
  ipcMain.handle(TRANSCRIPTION_IPC.stop, control("stop"));
  ipcMain.handle(TRANSCRIPTION_IPC.abort, control("abort"));

  return () => {
    for (const channel of [
      TRANSCRIPTION_IPC.status,
      TRANSCRIPTION_IPC.start,
      TRANSCRIPTION_IPC.stop,
      TRANSCRIPTION_IPC.abort,
    ]) {
      ipcMain.removeHandler(channel);
    }
    for (const live of sessions.values()) live.session.abort();
    sessions.clear();
  };
}
