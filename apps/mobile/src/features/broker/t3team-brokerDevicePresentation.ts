import { relativeTime } from "../../lib/time";
import type { BrokerDevice } from "./t3team-brokerDevices";

export interface BrokerDeviceRow {
  readonly icon: "desktopcomputer" | "cloud";
  readonly label: string;
  readonly detail: string;
  /** Only a device whose server is reachable can be opened. */
  readonly openable: boolean;
}

const machineDetail = (device: BrokerDevice) => {
  if (device.online) return "Online";
  return device.seenAt === null ? "Offline" : `Last seen ${relativeTime(device.seenAt)} ago`;
};

const cloudSessionDetail = (device: BrokerDevice) => {
  if (device.environmentId === null) return "Starting";
  return device.seenAt === null ? "Running" : `Running · ${relativeTime(device.seenAt)}`;
};

export function presentBrokerDevice(device: BrokerDevice): BrokerDeviceRow {
  return device.kind === "machine"
    ? {
        icon: "desktopcomputer",
        label: device.label,
        detail: machineDetail(device),
        openable: device.online,
      }
    : {
        icon: "cloud",
        label: device.label,
        detail: cloudSessionDetail(device),
        openable: device.environmentId !== null,
      };
}
