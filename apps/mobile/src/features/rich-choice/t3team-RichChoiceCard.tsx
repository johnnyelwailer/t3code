import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { splitRichChoiceBody } from "@t3tools/shared/t3team-richChoiceLogic";
import type { RichChoicePayloadOption } from "@t3tools/shared/t3team-richChoicePayload";

/** Stable keys for text that may repeat: the text, plus how many times it came before. */
function keyed(items: ReadonlyArray<string>): ReadonlyArray<{ key: string; text: string }> {
  const seen = new Map<string, number>();
  return items.map((text) => {
    const count = seen.get(text) ?? 0;
    seen.set(text, count + 1);
    return { key: `${text}#${count}`, text };
  });
}

/**
 * One card's content. The front card shows everything; peeking cards stay recognisable but quiet.
 * Everything is plain text: a title or body from an agent is never interpreted as markup.
 */
export function T3TeamRichChoiceCard(props: {
  readonly option: RichChoicePayloadOption;
  readonly front: boolean;
  readonly chosen: boolean;
  /** The front card's action row (the explicit "Choose this"). */
  readonly footer?: ReactNode;
}) {
  const { option, front, chosen } = props;
  return (
    <View
      className={cn(
        "flex-1 gap-3 rounded-3xl border bg-card p-5",
        chosen ? "border-primary" : "border-border",
      )}
    >
      <View className="gap-1">
        {option.tag ? (
          <Text
            textRole="micro"
            className="font-t3-bold uppercase tracking-widest text-foreground-muted"
          >
            {option.tag}
          </Text>
        ) : null}
        <Text textRole="headline" className="font-t3-bold">
          {option.title}
        </Text>
        {chosen ? (
          <Text textRole="label" className="font-t3-medium text-primary-text">
            Chosen
          </Text>
        ) : null}
      </View>
      <View className="gap-2">
        {keyed(splitRichChoiceBody(option.body)).map(({ key, text: paragraph }) => (
          <Text
            key={key}
            textRole="footnote"
            className="text-foreground-muted"
            numberOfLines={front ? undefined : 4}
          >
            {paragraph}
          </Text>
        ))}
      </View>
      {option.chips && option.chips.length > 0 ? (
        <View
          accessibilityLabel="What this changes"
          className="mt-auto flex-row flex-wrap gap-1.5 pt-1"
        >
          {keyed(option.chips).map(({ key, text: chip }) => (
            <View key={key} className="rounded-full bg-grouped-card px-2.5 py-1">
              <Text textRole="caption" className="text-foreground-muted">
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {props.footer ? <View className="pt-2">{props.footer}</View> : null}
    </View>
  );
}
