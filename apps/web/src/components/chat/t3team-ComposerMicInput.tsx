import { isElectron } from "../../env";
import { useIsVoiceThread } from "../../t3team/voice/t3team-useIsVoiceThread";
import { VoiceComposerMic } from "../../t3team/voice/t3team-VoiceComposerMic";
import { DesktopComposerVoiceInput } from "./t3team-DesktopComposerVoiceInput";
import { ComposerVoiceInput } from "./t3team-ComposerVoiceInput";

/**
 * Two stacks, one slot: the Electron desktop app transcribes on-device through the client-runtime
 * controller and the native whisper host (Web Speech is unreachable on-prem), while the browser
 * keeps the Web Speech composer input. In the voice thread the mic is the voice agent's instead.
 */
export function ComposerMicInput(props: {
  readonly onTranscript: (text: string) => void;
  readonly disabled: boolean;
  readonly environmentId: string | null;
  readonly threadId: string | null;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  if (isVoiceThread) return <VoiceComposerMic />;
  return isElectron ? (
    <DesktopComposerVoiceInput onTranscript={props.onTranscript} disabled={props.disabled} />
  ) : (
    <ComposerVoiceInput onTranscript={props.onTranscript} disabled={props.disabled} />
  );
}
