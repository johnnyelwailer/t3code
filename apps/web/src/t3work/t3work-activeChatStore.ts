import { create } from "zustand";

export type T3WorkActiveChatTarget =
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

type T3WorkActiveChatState = {
  target: T3WorkActiveChatTarget | null;
  setTarget: (target: T3WorkActiveChatTarget | null) => void;
};

export const useT3WorkActiveChatStore = create<T3WorkActiveChatState>((set) => ({
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
