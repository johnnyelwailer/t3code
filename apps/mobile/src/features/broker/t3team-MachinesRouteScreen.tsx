import { useNavigation } from "@react-navigation/native";
import { Platform, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { BrokerDeviceSections } from "./t3team-BrokerDeviceSections";
import { useBrokerDevices } from "./t3team-useBrokerDevices";

/** "My machines": the user's enrolled machines and cloud sessions, as the Nexi broker sees them. */
export function MachinesRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const devices = useBrokerDevices();

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidScreenHeader title="Machines" onBack={() => navigation.goBack()} />
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        refreshControl={
          <RefreshControl
            refreshing={devices.refreshing}
            onRefresh={() => void devices.refresh()}
          />
        }
      >
        <BrokerDeviceSections state={devices.state} onRetry={() => void devices.refresh()} />
      </ScrollView>
    </View>
  );
}
