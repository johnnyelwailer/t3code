import { Platform } from "react-native";
import { isNexiDistribution } from "../../features/connection/t3team-nexiConfig";

/**
 * Upstream hides vertical scroll indicators to match iOS. Android Nexi Work builds keep the
 * platform's fading indicator so long screens read as scrollable; stock builds are unchanged.
 */
export const showsDistributionScrollIndicator = Platform.OS === "android" && isNexiDistribution();
