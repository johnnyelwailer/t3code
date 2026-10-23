import { useFeatureFlag } from "../t3team-useFeatureFlag";
import { useVoiceThreadStore } from "./t3team-voiceThreadStore";

/** Whether `threadId` is this environment's voice thread. With `VOICE_SESSIONS` off it is not:
 * the thread keeps its messages and its composer offers dictation like any other thread. */
export function useIsVoiceThread(environmentId: string | null, threadId: string | null): boolean {
  const voiceSessionsEnabled = useFeatureFlag("VOICE_SESSIONS");
  const isVoiceHome = useVoiceThreadStore((store) =>
    environmentId === null || threadId === null
      ? false
      : store.homeByEnvironmentId[environmentId]?.threadId === threadId,
  );
  return voiceSessionsEnabled && isVoiceHome;
}
