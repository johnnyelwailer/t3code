import { isElectron } from "../../env";
import { DesktopComposerVoiceInput } from "./t3team-DesktopComposerVoiceInput";
import { ComposerVoiceInput } from "./t3team-ComposerVoiceInput";

/**
 * Two stacks, one slot: the Electron desktop app transcribes on-device through the client-runtime
 * controller and the native whisper host (Web Speech is unreachable on-prem), while the browser
 * keeps the Web Speech composer input.
 */
export function ComposerMicInput(props: {
  readonly onTranscript: (text: string) => void;
  readonly disabled: boolean;
}) {
  return isElectron ? (
    <DesktopComposerVoiceInput onTranscript={props.onTranscript} disabled={props.disabled} />
  ) : (
    <ComposerVoiceInput onTranscript={props.onTranscript} disabled={props.disabled} />
  );
}
