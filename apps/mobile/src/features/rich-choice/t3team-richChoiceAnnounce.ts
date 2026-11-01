import { Platform } from "react-native";

/**
 * Android reads a polite live region; iOS has none, so it announces explicitly. A move uses exactly
 * one of the two, because doing both makes Android say it twice.
 */
export function announcesViaLiveRegion(): boolean {
  return Platform.OS === "android";
}
