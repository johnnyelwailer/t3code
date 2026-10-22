// @effect-diagnostics globalDate:off -- Stop-to-text latency is measured for the voice log.
import type {
  DesktopVoiceStreamPushRequest,
  DesktopVoiceStreamStartRequest,
  DesktopVoiceStreamStartResult,
  DesktopVoiceStreamStopRequest,
  DesktopVoiceStreamStopResult,
  DesktopVoiceStreamEvent,
} from "@t3tools/contracts";

import { pcm16FromBase64 } from "./t3team-voicePcm.ts";
import type { DesktopVoiceService } from "./t3team-voiceService.ts";
import { createVoiceStreamSession } from "./t3team-voiceStreamSession.ts";

export type DesktopVoiceStreamService = {
  readonly start: (
    request: DesktopVoiceStreamStartRequest,
  ) => Promise<DesktopVoiceStreamStartResult>;
  readonly push: (request: DesktopVoiceStreamPushRequest) => void;
  readonly stop: (request: DesktopVoiceStreamStopRequest) => Promise<DesktopVoiceStreamStopResult>;
};

type ActiveSession = {
  readonly id: string;
  readonly session: ReturnType<typeof createVoiceStreamSession>;
  /** Whether this session saw a warm-up, so it gets exactly one `ready` when it ends. */
  warming: boolean;
};

const WARMUP_PERCENT = { loading: 15, "preparing-gpu": 65 } as const;

const NOTHING_SAID: DesktopVoiceStreamStopResult = { text: "", committed: 0 };

/**
 * Owns the one live recording stream. Starting a new stream ends the previous one, so a renderer
 * that died mid-recording cannot leave a pipeline running.
 */
export function makeDesktopVoiceStreamService(deps: {
  readonly voice: DesktopVoiceService;
  readonly emit: (event: DesktopVoiceStreamEvent) => void;
  readonly newSessionId: () => string;
  readonly log: (message: string) => void;
  readonly now?: () => number;
}): DesktopVoiceStreamService {
  const now = deps.now ?? Date.now;
  let active: ActiveSession | null = null;

  const stopActive = () => {
    active?.session.stop();
    active = null;
  };

  return {
    start: async ({ config }) => {
      const prepared = await deps.voice.prepare({ config, allowDownload: false });
      if (!prepared.ok) return prepared;
      stopActive();
      const id = deps.newSessionId();
      const session = createVoiceStreamSession({
        configuredLanguage: config.language,
        silenceMs: config.silenceMs,
        transcribe: ({ pcm16Base64, language }) =>
          deps.voice.transcribe({ config: { ...config, language }, pcm16Base64 }),
        isWorkerReady: deps.voice.isReady,
        emit: (event) => deps.emit({ ...event, sessionId: id }),
        log: (message) => deps.log(`[${id}] ${message}`),
      });
      const current: ActiveSession = { id, session, warming: false };
      active = current;
      deps.log(
        `[${id}] stream started (language ${config.language}, silence ${config.silenceMs} ms)`,
      );
      void deps.voice.warm(config).finally(() => {
        if (!current.warming) return;
        current.warming = false;
        deps.emit({ sessionId: id, type: "warmup", stage: "ready", percent: 100 });
      });
      return { ok: true, sessionId: id };
    },
    push: ({ sessionId, pcm16Base64 }) => {
      if (active?.id !== sessionId) return;
      // Repeated on every chunk while it lasts: the renderer only learns the session id once
      // `start` has answered, so a one-off event sent from `start` could arrive unclaimed.
      const stage = deps.voice.warmupStage();
      if (stage !== null) {
        active.warming = true;
        deps.emit({ sessionId, type: "warmup", stage, percent: WARMUP_PERCENT[stage] });
      }
      active.session.push(pcm16FromBase64(pcm16Base64));
    },
    stop: async ({ sessionId, finish }) => {
      const current = active;
      if (current?.id !== sessionId) return NOTHING_SAID;
      if (finish !== true) {
        stopActive();
        return NOTHING_SAID;
      }
      const stoppedAt = now();
      const result = await current.session.finish();
      if (active === current) active = null;
      deps.log(
        `[${current.id}] stream stop: final text ${now() - stoppedAt} ms after stop (${result.committed} utterance(s) committed, ${result.text.length} chars in the tail${result.error === undefined ? "" : ", tail failed"})`,
      );
      return result;
    },
  };
}
