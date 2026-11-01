import { useEffectEvent, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, withTiming } from "react-native-reanimated";

/**
 * A horizontal pan over the track. It only reports where the drag ended (`onEnd`, on the JS side,
 * for the shared swipe rule to resolve); it never chooses. The vertical axis fails the gesture
 * early so the chat feed keeps scrolling.
 */
export function useRichChoicePan(onEnd: (translationX: number) => void) {
  const dragX = useSharedValue(0);
  const finish = useEffectEvent(onEnd);
  // The worklets plugin copies what these callbacks close over when the gesture is built, so the
  // end reads its translation from the event and the JS side goes through an effect event.
  const [gesture] = useState(() =>
    Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-24, 24])
      .onUpdate((event) => {
        dragX.set(event.translationX);
      })
      .onEnd((event) => {
        runOnJS(finish)(event.translationX);
      })
      .onFinalize(() => {
        dragX.set(withTiming(0, { duration: 160 }));
      }),
  );
  return { gesture, dragX };
}
