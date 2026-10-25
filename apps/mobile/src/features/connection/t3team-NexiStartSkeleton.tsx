import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

function Block(props: { readonly className: string }) {
  return <View className={`rounded-full bg-subtle-strong ${props.className}`} />;
}

/** Placeholder with the same silhouette as the loaded screen; it announces itself once. */
export function NexiStartSkeleton() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 0.7 : pulse.value }));
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your desktops"
      style={style}
      className="gap-4"
    >
      <Block className="h-6 w-2/3" />
      <View className="overflow-hidden rounded-[22px] bg-grouped-card">
        {[0, 1, 2].map((key) => (
          <View key={key} className="min-h-16 flex-row items-center gap-3 px-4 py-3">
            <Block className="size-3" />
            <View className="flex-1 gap-2">
              <Block className="h-4 w-3/4" />
              <Block className="h-3 w-1/3" />
            </View>
          </View>
        ))}
      </View>
      <Block className="h-12 w-full" />
    </Animated.View>
  );
}
