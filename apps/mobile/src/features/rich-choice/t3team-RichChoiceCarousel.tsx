import { useState } from "react";
import { AccessibilityInfo, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Button } from "../../components/ui/Button";
import { AppText as Text } from "../../components/ui/AppText";
import {
  clampRichChoiceIndex,
  describeRichChoicePosition,
  resolveRichChoiceInitialIndex,
  resolveRichChoiceSwipe,
  toggleRichChoiceSelection,
} from "@t3tools/shared/t3team-richChoiceLogic";
import type { RichChoicePayloadOption } from "@t3tools/shared/t3team-richChoicePayload";
import { announcesViaLiveRegion } from "./t3team-richChoiceAnnounce";
import { T3TeamRichChoiceAction } from "./t3team-RichChoiceAction";
import { T3TeamRichChoiceControls } from "./t3team-RichChoiceControls";
import { T3TeamRichChoiceSlide } from "./t3team-RichChoiceSlide";
import {
  RICH_CHOICE_CARD_GAP,
  RICH_CHOICE_SPRING,
  richChoiceCardWidth,
  richChoiceMotion,
  richChoiceTrackOffset,
} from "./t3team-richChoiceMotion";
import { useRichChoicePan } from "./t3team-useRichChoicePan";

/** Read by screen readers only: 1pt, clipped, never laid out visibly. */
const ANNOUNCE_STYLE = { position: "absolute", width: 1, height: 1, opacity: 0 } as const;

/**
 * The mobile rich-choice carousel: one card in full with its neighbours peeking out. Swiping,
 * previous / next, the dots and tapping a peeking card only move the front card; a choice happens
 * through the explicit action on the front card. The movement rules are the shared ones the web
 * carousel uses (`@t3tools/shared/t3team-richChoiceLogic`).
 */
export function T3TeamRichChoiceCarousel(props: {
  /** Names the group for assistive tech. */
  readonly prompt: string;
  readonly options: ReadonlyArray<RichChoicePayloadOption>;
  readonly defaultId?: string | undefined;
  /** Options already chosen. Single: controlled. Multiple: the initial picks, later ones kept locally. */
  readonly selectedIds?: ReadonlyArray<string>;
  readonly multiple?: boolean;
  readonly chooseLabel?: string;
  readonly confirmLabel?: string;
  /** Browsing still works; choosing does not (answered, superseded or sending). */
  readonly disabled?: boolean;
  readonly onChoose: (ids: ReadonlyArray<string>) => void;
}) {
  const { options, multiple = false, disabled = false, selectedIds = [] } = props;
  const count = options.length;
  const [index, setIndex] = useState(() => resolveRichChoiceInitialIndex(options, props.defaultId));
  const [localPicked, setLocalPicked] = useState<ReadonlyArray<string>>(selectedIds);
  const { width: windowWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(windowWidth);
  const motion = richChoiceMotion(useReducedMotion());
  const frontIndex = clampRichChoiceIndex(index, count);
  const front = options[frontIndex];
  const cardWidth = richChoiceCardWidth(viewportWidth);
  const baseOffset = richChoiceTrackOffset(viewportWidth, cardWidth, frontIndex);

  const liveRegion = announcesViaLiveRegion();
  const goTo = (next: number) => {
    const target = clampRichChoiceIndex(next, count);
    const option = options[target];
    if (target === frontIndex || !option) return;
    setIndex(target);
    if (!liveRegion) {
      AccessibilityInfo.announceForAccessibility(
        describeRichChoicePosition(target, count, option.title),
      );
    }
  };
  const { gesture, dragX } = useRichChoicePan((translationX) =>
    goTo(resolveRichChoiceSwipe(translationX, cardWidth, frontIndex, count)),
  );
  const trackStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          motion.kind === "spring"
            ? withSpring(baseOffset, RICH_CHOICE_SPRING)
            : withTiming(baseOffset, {
                duration: motion.duration,
                easing: Easing.linear,
              }),
      },
      { translateX: dragX.get() },
    ],
  }));

  if (!front) return null;
  const known = new Set(options.map((option) => option.id));
  const picked = (multiple ? localPicked : selectedIds).filter((id) => known.has(id));
  const choose = () => {
    const next = toggleRichChoiceSelection(picked, front.id, multiple);
    if (multiple) setLocalPicked(next);
    else props.onChoose(next);
  };
  const onLayout = (event: LayoutChangeEvent) => setViewportWidth(event.nativeEvent.layout.width);

  return (
    <View accessibilityLabel={props.prompt} className="w-full gap-3">
      <GestureDetector gesture={gesture}>
        <View onLayout={onLayout} className="overflow-hidden py-2">
          <Reanimated.View
            style={[
              { flexDirection: "row", alignItems: "stretch", gap: RICH_CHOICE_CARD_GAP },
              trackStyle,
            ]}
          >
            {options.map((option, position) => (
              <T3TeamRichChoiceSlide
                key={option.id}
                option={option}
                label={describeRichChoicePosition(position, count, option.title)}
                width={cardWidth}
                front={position === frontIndex}
                chosen={picked.includes(option.id)}
                motion={motion}
                onShow={() => goTo(position)}
                footer={
                  <T3TeamRichChoiceAction
                    label={props.chooseLabel ?? "Choose this"}
                    multiple={multiple}
                    picked={picked.includes(front.id)}
                    disabled={disabled}
                    onPress={choose}
                  />
                }
              />
            ))}
          </Reanimated.View>
        </View>
      </GestureDetector>
      <T3TeamRichChoiceControls options={options} frontIndex={frontIndex} onGoTo={goTo} />
      {multiple ? (
        <Button
          label={`${props.confirmLabel ?? "Confirm"}${picked.length > 0 ? ` (${picked.length})` : ""}`}
          tone="primary"
          fullWidth
          disabled={disabled || picked.length === 0}
          onPress={() => props.onChoose(picked)}
        />
      ) : null}
      {liveRegion ? (
        <Text accessibilityLiveRegion="polite" style={ANNOUNCE_STYLE}>
          {describeRichChoicePosition(frontIndex, count, front.title)}
        </Text>
      ) : null}
    </View>
  );
}
