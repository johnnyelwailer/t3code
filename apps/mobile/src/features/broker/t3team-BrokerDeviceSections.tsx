import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ListRow } from "../../components/ListRow";
import { ListRowLayout } from "../../components/ListRowLayout";
import { AccountSection } from "../account/t3team-AccountSection";
import { SettingsActionRow } from "../settings/components/SettingsActionRow";
import { SettingsSection } from "../settings/components/SettingsSection";
import type { BrokerDeviceListState } from "./t3team-brokerDeviceList";
import type { BrokerDevice } from "./t3team-brokerDevices";
import { presentBrokerDevice } from "./t3team-brokerDevicePresentation";
import type { BrokerDeviceToOpen } from "./t3team-useOpenBrokerDevice";

function DeviceRows(props: {
  readonly devices: ReadonlyArray<BrokerDevice>;
  readonly opening: string | null;
  readonly onOpen: (device: BrokerDeviceToOpen) => void;
}) {
  return props.devices.map((device) => {
    const row = presentBrokerDevice(device);
    return row.openable ? (
      <ListRow
        key={device.key}
        icon={row.icon}
        label={row.label}
        detail={props.opening === device.key ? "Opening…" : row.detail}
        disabled={props.opening !== null}
        onPress={() => props.onOpen({ key: device.key, label: device.label })}
      />
    ) : (
      <ListRowLayout key={device.key} icon={row.icon} label={row.label} detail={row.detail} />
    );
  });
}

export function Hint(props: { readonly children: string }) {
  return <Text className="px-2 text-sm text-foreground-muted">{props.children}</Text>;
}

/**
 * The broker's answer, section by section. A sign-in the broker needs shows the Microsoft account
 * section in place, so the screen is never a dead end.
 */
export function BrokerDeviceSections(props: {
  readonly state: BrokerDeviceListState | null;
  readonly onRetry: () => void;
  readonly opening: string | null;
  readonly onOpen: (device: BrokerDeviceToOpen) => void;
}) {
  const { state } = props;
  if (state === null) return <Hint>Looking for your machines…</Hint>;
  if (state._tag === "Unavailable") return <Hint>This build has no Nexi broker configured.</Hint>;
  if (state._tag === "SignInRequired") {
    return (
      <View className="gap-2">
        <AccountSection />
        <Hint>Your machines and cloud sessions appear here once you are signed in.</Hint>
      </View>
    );
  }
  if (state._tag === "Failed") {
    return (
      <SettingsSection title="Your machines" footer={state.message}>
        <SettingsActionRow icon="arrow.clockwise" label="Try again" onPress={props.onRetry} />
      </SettingsSection>
    );
  }
  const machines = state.devices.filter((device) => device.kind === "machine");
  const cloudSessions = state.devices.filter((device) => device.kind === "cloudSession");
  return (
    <View className="gap-4">
      {machines.length > 0 ? (
        <SettingsSection title="Your machines">
          <DeviceRows devices={machines} opening={props.opening} onOpen={props.onOpen} />
        </SettingsSection>
      ) : (
        <Hint>No machines yet. Turn on phone access in Nexi Work on your desktop.</Hint>
      )}
      {cloudSessions.length > 0 ? (
        <SettingsSection title="Running cloud sessions">
          <DeviceRows devices={cloudSessions} opening={props.opening} onOpen={props.onOpen} />
        </SettingsSection>
      ) : null}
    </View>
  );
}
