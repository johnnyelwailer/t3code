import { useNavigation } from "@react-navigation/native";
import { Platform, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { BrokerDeviceSections, Hint } from "./t3team-BrokerDeviceSections";
import { CloudSessionSection, NoCloudSessionLauncher } from "./t3team-CloudSessionSection";
import { useBrokerDevices } from "./t3team-useBrokerDevices";
import { useCloudSessionLauncher } from "./t3team-useCloudSessionLauncher";
import { useOpenBrokerDevice } from "./t3team-useOpenBrokerDevice";

/**
 * "My machines": the user's enrolled machines and running cloud sessions as the Nexi broker sees
 * them, and the cloud sessions a connected machine starts for the phone.
 */
export function MachinesRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const devices = useBrokerDevices();
  const { launcher, launchers, choose } = useCloudSessionLauncher();
  const device = useOpenBrokerDevice();

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
        <BrokerDeviceSections
          state={devices.state}
          onRetry={() => void devices.refresh()}
          opening={device.opening}
          onOpen={(target) => void device.open(target)}
        />
        {device.failure === null ? null : <Hint>{device.failure}</Hint>}
        {launcher === null ? (
          <NoCloudSessionLauncher />
        ) : (
          <CloudSessionSection
            key={launcher.environmentId}
            launcher={launcher}
            launchers={launchers}
            onChooseLauncher={choose}
            onOpen={(target) => void device.open(target)}
          />
        )}
      </ScrollView>
    </View>
  );
}
