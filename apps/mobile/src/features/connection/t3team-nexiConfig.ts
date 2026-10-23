import Constants from "expo-constants";

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
