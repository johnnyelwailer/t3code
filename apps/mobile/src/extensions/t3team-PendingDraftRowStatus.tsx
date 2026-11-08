import { View } from "react-native";

import { SymbolView } from "../components/ui/AppSymbol";
import { AppText as Text } from "../components/ui/AppText";
import type { PendingDraft, PendingDraftTone } from "./t3team-pendingDraftTypes";

// Literal class names, so the styling compiler sees them.
const TONES = {
  working: {
    icon: "square.and.pencil",
    tint: "accent-adaptive-amber-700-300",
    text: "text-xs text-adaptive-amber-700-300",
  },
  ready: {
    icon: "checkmark.circle",
    tint: "accent-adaptive-emerald-600-400",
    text: "text-xs text-adaptive-emerald-600-400",
  },
  failed: {
    icon: "exclamationmark.triangle",
    tint: "accent-adaptive-rose-600-400",
    text: "text-xs text-adaptive-rose-600-400",
  },
} as const satisfies Record<PendingDraftTone, object>;

/** The right-hand status of a draft row in the Chats list: a distribution's live status, else "Draft". */
export function PendingDraftRowStatus(props: { readonly pendingDraft: PendingDraft | null }) {
  const tone = TONES[props.pendingDraft?.tone ?? "working"];
  return (
    <View className="flex-row items-center gap-1">
      <SymbolView name={tone.icon} size={10} tintColorClassName={tone.tint} type="monochrome" />
      <Text className={tone.text} numberOfLines={1}>
        {props.pendingDraft?.statusLabel ?? "Draft"}
      </Text>
    </View>
  );
}
