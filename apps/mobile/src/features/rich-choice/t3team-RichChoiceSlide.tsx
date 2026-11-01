import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Reanimated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import type { RichChoicePayloadOption } from "@t3tools/shared/t3team-richChoicePayload";
import { T3TeamRichChoiceCard } from "./t3team-RichChoiceCard";
import type { RichChoiceMotion } from "./t3team-richChoiceMotion";

/**
 * One position of the track. The front card is in full and interactive; a peeking card is quieter
 * (smaller unless motion is reduced), hidden from assistive tech, and tapping it brings it to the
 * front. Choosing never happens here: only the front card's own action chooses.
 */
export function T3TeamRichChoiceSlide(props: {
  readonly option: RichChoicePayloadOption;
  readonly label: string;
  readonly width: number;
  readonly front: boolean;
  readonly chosen: boolean;
  readonly motion: RichChoiceMotion;
  readonly footer: ReactNode;
  readonly onShow: () => void;
}) {
  const { front, motion } = props;
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(front ? 1 : motion.peekOpacity, { duration: 200 }),
    transform: [{ scale: withTiming(front ? 1 : motion.peekScale, { duration: 200 }) }],
  }));
  return (
    <Reanimated.View style={[{ width: props.width }, style]}>
      <View
        accessibilityLabel={props.label}
        accessibilityElementsHidden={!front}
        importantForAccessibility={front ? "auto" : "no-hide-descendants"}
        className="flex-1"
      >
        <T3TeamRichChoiceCard
          option={props.option}
          front={front}
          chosen={props.chosen}
          footer={front ? props.footer : undefined}
        />
      </View>
      {front ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show ${props.label}`}
          onPress={props.onShow}
          style={StyleSheet.absoluteFill}
        />
      )}
    </Reanimated.View>
  );
}
