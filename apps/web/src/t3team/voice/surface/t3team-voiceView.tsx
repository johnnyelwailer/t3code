import { createContext, useContext, type ReactNode } from "react";

import { useVoiceUiStore, type VoiceUiStore } from "./t3team-voiceUiStore";

export type VoiceUiView = Pick<VoiceUiStore, "snapshot" | "live" | "controls">;

const FrozenVoiceView = createContext<VoiceUiView | null>(null);

/** Shows `view` instead of the live store, so a surface that is animating out keeps its face. */
export function FrozenVoiceViewProvider(props: {
  readonly view: VoiceUiView | null;
  readonly children: ReactNode;
}) {
  return <FrozenVoiceView value={props.view}>{props.children}</FrozenVoiceView>;
}

/** The voice state a card renders: the frozen view when there is one, the live store otherwise. */
export function useVoiceView<T>(select: (view: VoiceUiView) => T): T {
  const frozen = useContext(FrozenVoiceView);
  const live = useVoiceUiStore((store) => select(store));
  return frozen === null ? live : select(frozen);
}
