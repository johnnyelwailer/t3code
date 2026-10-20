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

const IDLE_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };
const VIRTUAL_DRAFT = { ownerKey: "desktop-composer", text: "", selection: { start: 0, end: 0 } };

function getDesktopVoiceBridge(): DesktopVoiceBridge | undefined {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const { prepareVoiceTranscriber, transcribeVoice } = bridge ?? {};
  return prepareVoiceTranscriber && transcribeVoice
    ? { prepareVoiceTranscriber, transcribeVoice }
    : undefined;
}

function createController(input: {
  readonly bridge: DesktopVoiceBridge;
  readonly getConfig: () => DesktopVoiceConfig;
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
  });
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
  const available = useNativeTranscriberAvailable(bridge, config);

  useEffect(() => {
    if (!bridge) return;
    const controller = createController({
      bridge,
      getConfig: () => configRef.current,
      onTranscript: (text) => onTranscriptRef.current(text),
      onStateChange: setState,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [bridge]);

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.currentState.phase === "recording") void controller.stop();
    else void controller.start();
  }, []);
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);

  return { available, state, toggle, cancel };
}
