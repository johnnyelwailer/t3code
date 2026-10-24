import Constants from "expo-constants";
import { isNexiDistribution, resolveNexiConfig } from "./t3team-nexiConfig";

/** First run on Android Nexi Work builds: Entra sign-in leads, other connections stay one tap away. */
export function showsNexiWelcome(
  catalog: { readonly isLoadingConnections: boolean; readonly hasConnections: boolean },
  platform: string,
  extra = Constants.expoConfig?.extra,
) {
  return (
    platform === "android" &&
    isNexiDistribution(extra) &&
    resolveNexiConfig(extra) !== null &&
    !catalog.isLoadingConnections &&
    !catalog.hasConnections
  );
}
