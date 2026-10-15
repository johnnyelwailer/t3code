import { View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { MaterialFloatingActionButton } from "../../components/MaterialFloatingActionButton";
import { noEnvironmentsHero } from "../broker/t3team-noEnvironmentsHero";
import { usePrimaryCloudAction } from "../broker/t3team-usePrimaryCloudAction";

/** The empty detail pane when no environment is connected: sign in, or start a cloud session. */
export function NoEnvironmentsDetail() {
  const { signedIn, onPress } = usePrimaryCloudAction();
  const hero = noEnvironmentsHero(signedIn);
  return (
    <View className="w-full max-w-[430px]">
      <EmptyState
        title={hero.title}
        detail={hero.detail}
        variant="plain"
        action={
          <MaterialFloatingActionButton
            label={hero.actionLabel}
            icon="plus"
            variant="extended"
            tone="primary"
            onPress={onPress}
          />
        }
      />
    </View>
  );
}
