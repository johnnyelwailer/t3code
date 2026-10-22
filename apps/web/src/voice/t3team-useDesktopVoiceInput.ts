import { useCallback, useEffect, useRef, useState } from "react";
import {
  VoiceInputController,
  createDesktopVoiceTranscriber,
  type DesktopVoiceBridge,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { DesktopVoiceConfig, VoiceTranscriptMetadata } from "@t3tools/contracts";

import { usePrimarySettings } from "~/hooks/useSettings";
import { MediaVoiceRecorder, requestMicrophonePermission } from "./t3team-mediaVoiceRecorder";
import { decodeRecordingToPcm16Base64 } from "./t3team-recordingToPcm";
import { createVoicePcmTap, type VoicePcmTap, type VoiceStreamBridge } from "./t3team-voicePcmTap";
import { useVoiceModelProgressPercent } from "./t3team-useVoiceModelProgress";
import { useVoiceStream } from "./t3team-useVoiceStream";

const IDLE_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };
const VIRTUAL_DRAFT = { ownerKey: "desktop-composer", text: "", selection: { start: 0, end: 0 } };

function getDesktopVoiceBridge(): DesktopVoiceBridge | undefined {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const { prepareVoiceTranscriber, transcribeVoice } = bridge ?? {};
  return prepareVoiceTranscriber && transcribeVoice
    ? { prepareVoiceTranscriber, transcribeVoice }
    : undefined;
}

function getVoiceStreamBridge(): VoiceStreamBridge | undefined {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const { startVoiceStream, pushVoiceStream, stopVoiceStream } = bridge ?? {};
  return startVoiceStream && pushVoiceStream && stopVoiceStream
    ? { startVoiceStream, pushVoiceStream, stopVoiceStream }
    : undefined;
}

function createController(input: {
  readonly bridge: DesktopVoiceBridge;
  readonly getConfig: () => DesktopVoiceConfig;
  readonly tap: VoicePcmTap | undefined;
  readonly onTranscript: (text: string) => void;
  readonly hasCommittedSpeech: () => boolean;
  readonly onStateChange: (state: VoiceInputState) => void;
}): VoiceInputController {
  const transcriber = createDesktopVoiceTranscriber({
    bridge: input.bridge,
    getConfig: input.getConfig,
    decodeRecording: decodeRecordingToPcm16Base64,
    finishLiveSession: () => input.tap?.finish() ?? Promise.resolve(null),
  });
  const recorder: MediaVoiceRecorder = new MediaVoiceRecorder((url) => {
    void controller.handleRecorderStatus({ isFinished: true, hasError: false, error: null, url });
  }, input.tap);
  const controller: VoiceInputController = new VoiceInputController({
    recorder,
    getTranscriber: () => transcriber,
    requestPermission: requestMicrophonePermission,
    configureRecording: () => Promise.resolve(),
    releaseRecording: () => Promise.resolve(),
    deleteRecording: (uri) => URL.revokeObjectURL(uri),
    readDraft: () => ({ ...VIRTUAL_DRAFT, revision: 0 }),
    commitTranscript: input.onTranscript,
    hasCommittedSpeech: input.hasCommittedSpeech,
    onStateChange: input.onStateChange,
  });
  return controller;
}

/** Whether the native transcriber exists in this runtime; a missing model is fetched on first use. */
function useNativeTranscriberAvailable(
  bridge: DesktopVoiceBridge | undefined,
  config: DesktopVoiceConfig,
) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let current = true;
    void bridge
      ?.prepareVoiceTranscriber({ config, allowDownload: false })
      .then((result) => {
        if (current) setAvailable(result.ok || result.code !== "runtime-unavailable");
      })
      .catch(() => current && setAvailable(false));
    return () => {
      current = false;
    };
  }, [bridge, config]);
  return available;
}

/**
 * The desktop recorder as a session: the hotkey opens it, the speaker's pauses commit utterances
 * through `onTranscript` while it stays open, and the next press (or a long quiet) ends it, after
 * which whatever was said since the last utterance is written down and committed too.
 */
export function useDesktopVoiceInput(
  onTranscript: (text: string, metadata?: VoiceTranscriptMetadata) => void,
  onUtteranceFailed: (message: string) => void,
) {
  const bridge = getDesktopVoiceBridge();
  const config = usePrimarySettings((settings) => settings.voice.transcriber);
  const configRef = useRef(config);
  const onTranscriptRef = useRef(onTranscript);
  const onUtteranceFailedRef = useRef(onUtteranceFailed);
  useEffect(() => {
    configRef.current = config;
    onTranscriptRef.current = onTranscript;
    onUtteranceFailedRef.current = onUtteranceFailed;
  }, [config, onTranscript, onUtteranceFailed]);
  const [state, setState] = useState(IDLE_STATE);
  const controllerRef = useRef<VoiceInputController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const committedSpeechRef = useRef(0);
  const available = useNativeTranscriberAvailable(bridge, config);
  const downloadPercent = useVoiceModelProgressPercent(state.phase === "preparing");

  useEffect(() => {
    if (!bridge) return;
    const streamBridge = getVoiceStreamBridge();
    const tap =
      streamBridge &&
      createVoicePcmTap({
        bridge: streamBridge,
        getConfig: () => configRef.current,
        onSession: (id) => {
          sessionIdRef.current = id;
          if (id !== null) committedSpeechRef.current = 0;
        },
      });
    const controller = createController({
      bridge,
      getConfig: () => configRef.current,
      tap,
      onTranscript: (text) => {
        committedSpeechRef.current += 1;
        onTranscriptRef.current(text);
      },
      hasCommittedSpeech: () => committedSpeechRef.current > 0,
      onStateChange: (next) => {
        if (next.phase === "idle" || next.phase === "error") tap?.discard();
        setState(next);
      },
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      tap?.discard();
      controllerRef.current = null;
    };
  }, [bridge]);

  const stream = useVoiceStream({
    active: state.phase !== "idle" && state.phase !== "error",
    sessionIdRef,
    onSessionEnd: () => {
      if (controllerRef.current?.currentState.phase === "recording") {
        void controllerRef.current.stop();
      }
    },
    onUtterance: (text, metadata) => {
      committedSpeechRef.current += 1;
      onTranscriptRef.current(text, metadata);
    },
    onUtteranceFailed: (message) => onUtteranceFailedRef.current(message),
  });

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.currentState.phase === "recording") void controller.stop();
    else void controller.start();
  }, []);
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);
  const sessionId = useCallback(() => sessionIdRef.current, []);

  return { available, state, downloadPercent, stream, toggle, cancel, sessionId };
}
