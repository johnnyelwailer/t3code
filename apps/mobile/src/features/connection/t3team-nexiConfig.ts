import Constants from "expo-constants";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stock builds carry no `extra.nexi`; the Nexi Work distribution always seeds it. */
export function isNexiDistribution(extra = Constants.expoConfig?.extra) {
  return isRecord(extra?.nexi);
}

/** The distribution's build-time feature flag defaults, below any paired server's value. */
export function nexiFeatureFlagPreset(
  extra = Constants.expoConfig?.extra,
): Readonly<Record<string, boolean>> {
  const flags: unknown = extra?.nexi?.featureFlags;
  if (!isRecord(flags)) return {};
  return Object.fromEntries(
    Object.entries(flags).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

export function resolveNexiConfig(extra = Constants.expoConfig?.extra) {
  const env = extra?.nexi?.env;
  const secureUrl = (value: unknown) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password
        ? url.toString().replace(/\/$/, "")
        : null;
    } catch {
      return null;
    }
  };
  const brokerUrl = secureUrl(env?.T3CODE_NEXI_BROKER_URL);
  const deviceEndpoint = secureUrl(env?.T3CODE_NEXI_ACCOUNT_DEVICE_ENDPOINT);
  const tokenEndpoint = secureUrl(env?.T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT);
  const app: unknown = env?.T3CODE_NEXI_BROKER_APP;
  const tenant: unknown = env?.T3CODE_NEXI_BROKER_TENANT;
  return brokerUrl &&
    deviceEndpoint &&
    tokenEndpoint &&
    typeof app === "string" &&
    app.trim() &&
    typeof tenant === "string" &&
    tenant.trim()
    ? { brokerUrl, deviceEndpoint, tokenEndpoint, app: app.trim(), tenant: tenant.trim() }
    : null;
}
