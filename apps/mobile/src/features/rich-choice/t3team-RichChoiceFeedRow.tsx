import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import type { T3TeamRichChoiceFeedEntry } from "../../lib/t3team-richChoiceFeed";
import { sendT3TeamRichChoicePick } from "../../state/t3team-sendRichChoicePick";
import { T3TeamRichChoiceCarousel } from "./t3team-RichChoiceCarousel";

type SendState =
  | { readonly status: "idle" }
  | { readonly status: "sending" | "sent"; readonly ids: ReadonlyArray<string> }
  | { readonly status: "failed" };

/** What the card says about itself; null while it is simply open. Shared by the row and its tests. */
export function richChoiceNote(
  answered: boolean,
  stale: boolean,
  send: SendState,
): { readonly text: string; readonly alert: boolean } | null {
  if (answered || send.status === "sent") return { text: "Your pick was sent.", alert: false };
  if (stale) return { text: "This question was superseded.", alert: false };
  if (send.status === "sending") return { text: "Sending your pick…", alert: false };
  if (send.status === "failed")
    return { text: "Your pick could not be sent. Try again.", alert: true };
  return null;
}

/**
 * A rich-choice card in the thread feed. Whether it is open, answered or superseded comes from the
 * thread (so it survives remounts and reloads); a pick goes back as the hidden, agent-visible widget
 * action message. The first answer wins: the card locks while sending and once sent, and a failed
 * send leaves it open for a retry.
 */
export function T3TeamRichChoiceFeedRow(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly entry: T3TeamRichChoiceFeedEntry;
  readonly send?: typeof sendT3TeamRichChoicePick;
}) {
  const { entry, send = sendT3TeamRichChoicePick } = props;
  const { payload, state } = entry;
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });
  const answeredIds = state.status === "answered" ? state.pickedIds : null;
  const stale = state.status === "stale";
  const locked =
    answeredIds !== null || stale || sendState.status === "sending" || sendState.status === "sent";
  const pickedIds =
    answeredIds ??
    (sendState.status === "sending" || sendState.status === "sent" ? sendState.ids : []);

  const choose = (ids: ReadonlyArray<string>) => {
    if (locked) return;
    setSendState({ status: "sending", ids });
    send({
      environmentId: props.environmentId,
      threadId: props.threadId,
      widgetId: entry.widgetId,
      widgetTitle: entry.title,
      payload,
      pickedIds: ids,
    }).then(
      () => setSendState({ status: "sent", ids }),
      () => setSendState({ status: "failed" }),
    );
  };

  const note = richChoiceNote(answeredIds !== null, stale, sendState);
  return (
    <View className="my-2 gap-3">
      <Text textRole="footnote" className="font-t3-medium">
        {payload.prompt}
      </Text>
      <T3TeamRichChoiceCarousel
        prompt={payload.prompt}
        options={payload.options}
        defaultId={payload.default_id}
        multiple={payload.multiple === true}
        selectedIds={pickedIds}
        disabled={locked}
        onChoose={choose}
      />
      {note ? (
        <Text
          accessibilityRole={note.alert ? "alert" : undefined}
          accessibilityLiveRegion={note.alert ? "assertive" : "polite"}
          textRole="caption"
          className={
            note.alert ? "text-center text-danger-foreground" : "text-center text-foreground-muted"
          }
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}
