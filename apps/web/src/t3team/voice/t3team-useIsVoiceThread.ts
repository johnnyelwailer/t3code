import { useVoiceThreadStore } from "./t3team-voiceThreadStore";

/** Whether `threadId` is this environment's voice thread. */
export function useIsVoiceThread(environmentId: string | null, threadId: string | null): boolean {
  return useVoiceThreadStore((store) =>
    environmentId === null || threadId === null
      ? false
      : store.homeByEnvironmentId[environmentId]?.threadId === threadId,
  );
}
