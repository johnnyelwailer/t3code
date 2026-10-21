import type {
  DesktopVoiceStreamPushRequest,
  DesktopVoiceStreamStartRequest,
  DesktopVoiceStreamStartResult,
  DesktopVoiceStreamStopRequest,
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
  readonly stop: (request: DesktopVoiceStreamStopRequest) => void;
};

type ActiveSession = {
  readonly id: string;
  readonly session: ReturnType<typeof createVoiceStreamSession>;
};

/**
 * Owns the one live recording stream. Starting a new stream ends the previous one, so a renderer
 * that died mid-recording cannot leave a pipeline running.
 */
export function makeDesktopVoiceStreamService(deps: {
  readonly voice: DesktopVoiceService;
  readonly emit: (event: DesktopVoiceStreamEvent) => void;
  readonly newSessionId: () => string;
  readonly log: (message: string) => void;
}): DesktopVoiceStreamService {
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
        emit: (event) => deps.emit({ ...event, sessionId: id }),
        log: (message) => deps.log(`[${id}] ${message}`),
      });
      active = { id, session };
      deps.log(
        `[${id}] stream started (language ${config.language}, silence ${config.silenceMs} ms)`,
      );
      void deps.voice.warm(config);
      return { ok: true, sessionId: id };
    },
    push: ({ sessionId, pcm16Base64 }) => {
      if (active?.id === sessionId) active.session.push(pcm16FromBase64(pcm16Base64));
    },
    stop: ({ sessionId }) => {
      if (active?.id === sessionId) stopActive();
    },
  };
}
