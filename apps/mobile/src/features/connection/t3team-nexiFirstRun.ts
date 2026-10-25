import Constants from "expo-constants";
import { isNexiDistribution, resolveNexiConfig } from "./t3team-nexiConfig";

/**
 * First run on Nexi Work builds (iOS + Android): Entra sign-in leads, other
 * connections stay one tap away. Stock T3 Code builds have no `extra.nexi`.
 */
export function showsNexiWelcome(
  catalog: { readonly isLoadingConnections: boolean; readonly hasConnections: boolean },
  platform: string,
  extra = Constants.expoConfig?.extra,
) {
  return (
    (platform === "android" || platform === "ios") &&
    isNexiDistribution(extra) &&
    resolveNexiConfig(extra) !== null &&
    !catalog.isLoadingConnections &&
    !catalog.hasConnections
  );
}
