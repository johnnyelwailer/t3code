import type { ThreadId } from "@t3tools/contracts";

import { useVoiceHotkeyKeys } from "./surface/t3team-useVoiceHotkeyKeys";
import { VoiceThreadRow } from "./surface/t3team-VoiceThreadRow";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { useVoiceRowMenu } from "./t3team-useVoiceRowMenu";

/**
 * The voice thread's place in the thread list; without a thread yet it is the way to the first
 * recording. Once a thread exists its context menu can start a fresh one (`onOpenThread` opens the
 * new thread when the old one was on screen).
 */
export function VoiceSidebarRow(props: {
  readonly title: string;
  readonly isActive: boolean;
  readonly onOpen?: () => void;
  readonly onOpenThread?: (threadId: ThreadId) => void;
}) {
  const { onOpenThread, ...rowProps } = props;
  const keys = useVoiceHotkeyKeys();
  const hasRecorder = useVoiceUiStore((store) => store.controls !== null);
  const openMenu = useVoiceRowMenu({ isActive: props.isActive, onOpenThread });
  if (!hasRecorder && props.onOpen === undefined) return null;
  return (
    <VoiceThreadRow
      {...rowProps}
      keys={keys}
      {...(props.onOpen === undefined ? {} : { onContextMenu: openMenu })}
    />
  );
}
