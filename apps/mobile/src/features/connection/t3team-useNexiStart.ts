import { deriveNexiStartModel, type NexiStartActionId } from "./t3team-nexiStartModel";
import type { NexiStartHandlers } from "./t3team-NexiStartPanel";
import { useNexiHosts } from "./t3team-useNexiHosts";

/** Live account, broker and network state, mapped to the start screen model and its handlers. */
export function useNexiStart(options: {
  readonly onPair?: () => void;
  readonly onConnected?: () => void;
}) {
  const state = useNexiHosts(options.onConnected ? { onConnected: options.onConnected } : {});
  const model = deriveNexiStartModel(state.input);
  const run: Record<NexiStartActionId, () => void> = {
    "sign-in": state.signIn,
    refresh: state.refresh,
    "sign-out": state.signOut,
    pair: options.onPair ?? (() => {}),
  };
  const hosts = state.input.hosts ?? [];
  const handlers: NexiStartHandlers = {
    onAction: (id) => run[id](),
    onHost: (id) => {
      const host = hosts.find((candidate) => candidate.id === id);
      if (host) state.connect(host);
    },
    onCancelSignIn: state.cancel,
    onError: state.setError,
  };
  return { model, code: state.code, handlers };
}
