import { View } from "react-native";

import { AppText } from "../components/ui/AppText";
import { PendingDraftCardSlot } from "./t3team-PendingDraftCardSlot";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/**
 * What the draft screen shows above its composer while no model is known yet. A pending draft shows
 * its status card (it says why Send waits and offers the retry); any other draft keeps the stock line.
 */
export function PendingDraftFallbackNotice(props: {
  readonly pendingDraft: PendingDraft | null;
  readonly draftKey: string | null;
  readonly stockText: string;
}) {
  if (props.pendingDraft === null || props.draftKey === null) {
    return <AppText className="text-foreground-muted">{props.stockText}</AppText>;
  }
  return (
    <View>
      <PendingDraftCardSlot pendingDraft={props.pendingDraft} draftKey={props.draftKey} />
    </View>
  );
}
