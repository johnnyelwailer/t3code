import { createContext, useContext } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { startChatHere, type StartChatHereDeps } from "~/t3team/t3team-startChatHere";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

export type StartChatHere = (target: T3TeamViewTarget) => void;

/** The app shell owns the project store a new thread lands in; views far below it start one here. */
const StartChatHereContext = createContext<StartChatHere | null>(null);

export const StartChatHereProvider = StartChatHereContext.Provider;

/** Null outside the app shell: views there offer no "New chat here". */
export function useStartChatHere(): StartChatHere | null {
  return useContext(StartChatHereContext);
}

export function useStartChatHereAction(input: Omit<StartChatHereDeps, "environmentId">) {
  const environmentId = usePrimaryEnvironmentId();
  const { resolveProjectId, createThread, openFullThread } = input;
  const start: StartChatHere = (target) => {
    startChatHere({ environmentId, resolveProjectId, createThread, openFullThread }, target);
  };
  return start;
}
