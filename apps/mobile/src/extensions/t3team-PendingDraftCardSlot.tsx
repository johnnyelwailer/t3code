import { View } from "react-native";

import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/** The pending draft's status card above the composer controls, isolated; nothing without one. */
export function PendingDraftCardSlot(props: {
  readonly pendingDraft: PendingDraft | null;
  readonly draftKey: string | null;
}) {
  const Card = props.pendingDraft?.Card;
  if (!Card || props.draftKey === null) return null;
  return (
    <View className="px-1 pb-2">
      <ExtensionBoundary>
        <Card draftKey={props.draftKey} />
      </ExtensionBoundary>
    </View>
  );
}
