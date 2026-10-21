import { useCallback, useEffect, useRef, useState } from "react";
import {
  VoiceInputController,
  createDesktopVoiceTranscriber,
  type DesktopVoiceBridge,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { DesktopVoiceConfig } from "@t3tools/contracts";

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
  readonly onStateChange: (state: VoiceInputState) => void;
}): VoiceInputController {
  const transcriber = createDesktopVoiceTranscriber({
    bridge: input.bridge,
    getConfig: input.getConfig,
    decodeRecording: decodeRecordingToPcm16Base64,
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

export function useDesktopVoiceInput(onTranscript: (text: string) => void) {
  const bridge = getDesktopVoiceBridge();
  const config = usePrimarySettings((settings) => settings.voice.transcriber);
  const configRef = useRef(config);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    configRef.current = config;
    onTranscriptRef.current = onTranscript;
  }, [config, onTranscript]);
  const [state, setState] = useState(IDLE_STATE);
  const controllerRef = useRef<VoiceInputController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lockedLanguageRef = useRef<string | null>(null);
  const available = useNativeTranscriberAvailable(bridge, config);
  const downloadPercent = useVoiceModelProgressPercent(state.phase === "preparing");

  useEffect(() => {
    if (!bridge) return;
    const streamBridge = getVoiceStreamBridge();
    const controller = createController({
      bridge,
      getConfig: () => ({
        ...configRef.current,
        language: lockedLanguageRef.current ?? configRef.current.language,
      }),
      tap:
        streamBridge &&
        createVoicePcmTap({
          bridge: streamBridge,
          getConfig: () => configRef.current,
          onSession: (id) => {
            sessionIdRef.current = id;
            if (id !== null) lockedLanguageRef.current = null;
          },
        }),
      onTranscript: (text) => onTranscriptRef.current(text),
      onStateChange: setState,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [bridge]);

  const stream = useVoiceStream({
    active: state.phase !== "idle" && state.phase !== "error",
    sessionIdRef,
    onAutoCommit: () => {
      if (controllerRef.current?.currentState.phase === "recording") {
        void controllerRef.current.stop();
      }
    },
    onLanguage: (language) => {
      lockedLanguageRef.current = language;
    },
  });

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.currentState.phase === "recording") void controller.stop();
    else void controller.start();
  }, []);
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);

  return { available, state, downloadPercent, stream, toggle, cancel };
}
