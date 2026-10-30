import { View } from "react-native";

import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/** The pending draft's status card above the composer controls, isolated; nothing when not pending. */
export function PendingDraftCardSlot(props: {
  readonly pendingDraft: PendingDraft | null;
  readonly draftKey: string | null;
}) {
  if (props.pendingDraft === null || props.draftKey === null) return null;
  const Card = props.pendingDraft.Card;
  return (
    <View className="px-1 pb-2">
      <ExtensionBoundary>
        <Card draftKey={props.draftKey} />
      </ExtensionBoundary>
    </View>
  );
}
