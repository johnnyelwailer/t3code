import { useVoiceHotkeyKeys } from "./surface/t3team-useVoiceHotkeyKeys";
import { VoiceThreadRow } from "./surface/t3team-VoiceThreadRow";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";

/** The voice thread's place in the thread list; without a thread yet it is the way to the first recording. */
export function VoiceSidebarRow(props: {
  readonly title: string;
  readonly isActive: boolean;
  readonly onOpen?: () => void;
}) {
  const keys = useVoiceHotkeyKeys();
  const hasRecorder = useVoiceUiStore((store) => store.controls !== null);
  if (!hasRecorder && props.onOpen === undefined) return null;
  return <VoiceThreadRow {...props} keys={keys} />;
}
