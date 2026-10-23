import { isElectron } from "../../env";
import { useIsVoiceThread } from "../../t3team/voice/t3team-useIsVoiceThread";
import { VoiceComposerMic } from "../../t3team/voice/t3team-VoiceComposerMic";
import { useFeatureFlag } from "../../t3team/t3team-useFeatureFlag";
import { DesktopComposerVoiceInput } from "./t3team-DesktopComposerVoiceInput";
import { ComposerVoiceInput } from "./t3team-ComposerVoiceInput";

/**
 * Two stacks, one slot: the Electron desktop app transcribes on-device through the client-runtime
 * controller and the native whisper host (Web Speech is unreachable on-prem), while the browser
 * keeps the Web Speech composer input. In the voice thread the mic is the voice agent's instead.
 * Dictation is behind `UI_VOICE_INPUT`; the voice thread's mic is not.
 */
export function ComposerMicInput(props: {
  readonly onTranscript: (text: string) => void;
  readonly disabled: boolean;
  readonly environmentId: string | null;
  readonly threadId: string | null;
  /** The draft the transcript lands in; switching it cancels any recording in progress. */
  readonly sessionKey: string;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  const dictationEnabled = useFeatureFlag("UI_VOICE_INPUT");
  if (isVoiceThread) return <VoiceComposerMic />;
  if (!dictationEnabled) return null;
  return isElectron ? (
    <DesktopComposerVoiceInput
      onTranscript={props.onTranscript}
      disabled={props.disabled}
      sessionKey={props.sessionKey}
    />
  ) : (
    <ComposerVoiceInput
      onTranscript={props.onTranscript}
      disabled={props.disabled}
      sessionKey={props.sessionKey}
    />
  );
}
