import { create } from "zustand";

export type T3TeamActiveChatTarget =
  | {
      type: "thread";
      projectId: string;
      threadId: string;
    }
  | {
      type: "kickoff";
      projectId: string;
      ticketId: string;
    };

type T3TeamActiveChatState = {
  target: T3TeamActiveChatTarget | null;
  setTarget: (target: T3TeamActiveChatTarget | null) => void;
};

export const useT3TeamActiveChatStore = create<T3TeamActiveChatState>((set) => ({
  target: null,
  setTarget: (target) => {
    set((state) => {
      const current = state.target;
      if (current === target) {
        return state;
      }
      if (!current || !target) {
        return { target };
      }
      if (current.type !== target.type || current.projectId !== target.projectId) {
        return { target };
      }
      if (current.type === "thread" && target.type === "thread") {
        return current.threadId === target.threadId ? state : { target };
      }
      if (current.type === "kickoff" && target.type === "kickoff") {
        return current.ticketId === target.ticketId ? state : { target };
      }
      return { target };
    });
  },
}));
