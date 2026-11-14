import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import type { T3TeamRichChoiceFeedEntry } from "../../lib/t3team-richChoiceFeed";
import { sendT3TeamRichChoicePick } from "../../state/t3team-sendRichChoicePick";
import { T3TeamRichChoiceCarousel } from "./t3team-RichChoiceCarousel";

type SendState =
  | { readonly status: "idle" }
  | { readonly status: "sending" | "queued"; readonly ids: ReadonlyArray<string> }
  | { readonly status: "failed" };

/**
 * What the card says about itself; null while it is simply open. "Queued" is a pick saved for
 * delivery (or accepted but not yet answered in the thread); "sent" is said only once the thread
 * shows the answering message.
 */
export function richChoiceNote(
  answered: boolean,
  stale: boolean,
  queued: boolean,
  send: SendState,
): { readonly text: string; readonly alert: boolean } | null {
  if (answered) return { text: "Your pick was sent.", alert: false };
  if (stale) return { text: "This question was superseded.", alert: false };
  if (queued || send.status === "queued")
    return { text: "Your pick is queued. It is sent when the agent can take it.", alert: false };
  if (send.status === "sending") return { text: "Saving your pick…", alert: false };
  if (send.status === "failed")
    return { text: "Your pick could not be sent. Try again.", alert: true };
  return null;
}

/**
 * A rich-choice card in the thread feed. A pick is the hidden widget action message; the first
 * answer wins, so the card locks while saving, while queued (kept across restarts by the outbox)
 * and once answered. A failed save reopens it for a retry.
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
  const inFlight = useRef(false);
  const answeredIds = state.status === "answered" ? state.pickedIds : null;
  const queuedIds = state.status === "queued" ? state.pickedIds : null;
  const stale = state.status === "stale";
  const locked =
    answeredIds !== null ||
    queuedIds !== null ||
    stale ||
    sendState.status === "sending" ||
    sendState.status === "queued";
  const pickedIds =
    answeredIds ??
    queuedIds ??
    (sendState.status === "sending" || sendState.status === "queued" ? sendState.ids : []);

  const choose = (ids: ReadonlyArray<string>) => {
    // The ref closes the window before the next render disables the card: a fast double tap
    // would otherwise queue two picks.
    if (locked || inFlight.current) return;
    inFlight.current = true;
    setSendState({ status: "sending", ids });
    send({
      environmentId: props.environmentId,
      threadId: props.threadId,
      widgetId: entry.widgetId,
      widgetTitle: entry.title,
      payload,
      pickedIds: ids,
    }).then(
      () => setSendState({ status: "queued", ids }),
      () => {
        inFlight.current = false;
        setSendState({ status: "failed" });
      },
    );
  };

  const note = richChoiceNote(answeredIds !== null, stale, queuedIds !== null, sendState);
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
