import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

/** Where one environment's voice thread lives. The id is stored, never found by title. */
export interface VoiceThreadHome {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
}

interface VoiceThreadStoreState {
  readonly homeByEnvironmentId: Readonly<Record<string, VoiceThreadHome>>;
  readonly remember: (environmentId: string, home: VoiceThreadHome) => void;
  readonly forget: (environmentId: string) => void;
}

export const useVoiceThreadStore = create<VoiceThreadStoreState>()(
  persist(
    (set) => ({
      homeByEnvironmentId: {},
      remember: (environmentId, home) =>
        set((state) => ({
          homeByEnvironmentId: { ...state.homeByEnvironmentId, [environmentId]: home },
        })),
      forget: (environmentId) =>
        set((state) => {
          const { [environmentId]: _forgotten, ...rest } = state.homeByEnvironmentId;
          return { homeByEnvironmentId: rest };
        }),
    }),
    {
      name: "t3code:voice-thread:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ homeByEnvironmentId }) => ({ homeByEnvironmentId }),
    },
  ),
);
