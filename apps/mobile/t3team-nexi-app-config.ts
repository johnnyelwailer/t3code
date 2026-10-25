import type { ExpoConfig } from "expo/config";
import { resolveNexiMobileEnv } from "../../scripts/lib/t3team-nexiMobileConfig.ts";

/** The distribution overlay may replace these assets with its pack's absolute paths. */
export function withNexiMobileConfig(
  config: ExpoConfig,
  env: Record<string, string | undefined>,
): ExpoConfig {
  const publicEnv = resolveNexiMobileEnv(env);
  if (!publicEnv.T3CODE_NEXI_BROKER_URL) return config;
  // The native broker module refuses to send the Entra bearer to any other origin.
  const brokerOriginPlugin: NonNullable<ExpoConfig["plugins"]>[number] = [
    "./plugins/t3team-withNexiBrokerOrigin.cjs",
    { origin: new URL(publicEnv.T3CODE_NEXI_BROKER_URL).origin },
  ];
  const mark = "./assets/t3team-nexplore-mark.png";
  return {
    ...config,
    name: "Nexi Work",
    slug: "nexi-work",
    scheme: "nexiwork",
    icon: mark,
    updates: { enabled: false },
    ios: { ...config.ios, bundleIdentifier: "com.nexplore.nexiwork", icon: mark },
    android: {
      ...config.android,
      package: "com.nexplore.nexiwork",
      icon: mark,
      adaptiveIcon: { foregroundImage: mark, backgroundColor: "#ffffff" },
    },
    extra: { ...config.extra, nexi: { env: publicEnv } },
    plugins: [...(config.plugins ?? []), brokerOriginPlugin].map((entry) => {
      const [name, options = {}] = Array.isArray(entry) ? entry : [entry];
      if (name === "expo-font")
        return [
          name,
          { ...options, fonts: [...(options.fonts ?? []), "./assets/t3team-buenos-aires-vf.ttf"] },
        ];
      if (name === "expo-splash-screen")
        return [
          name,
          {
            ...options,
            image: mark,
            dark: { ...options.dark, image: mark },
            android: { ...options.android, image: mark, dark: { image: mark } },
          },
        ];
      return entry;
    }),
  };
}
