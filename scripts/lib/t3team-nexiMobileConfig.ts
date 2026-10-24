// Public, flat distribution contract. Never copy arbitrary process env into an Expo manifest.
export const NEXI_MOBILE_ENV_KEYS = [
  "T3CODE_NEXI_BROKER_URL",
  "T3CODE_NEXI_BROKER_TENANT",
  "T3CODE_NEXI_BROKER_APP",
  "T3CODE_NEXI_ACCOUNT_AUTHORIZATION_ENDPOINT",
  "T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT",
  "T3CODE_NEXI_ACCOUNT_DEVICE_ENDPOINT",
  "T3CODE_NEXI_PROVIDER_ENDPOINT",
] as const;

export function resolveNexiMobileEnv(
  ...sources: readonly Readonly<Record<string, string | undefined>>[]
) {
  return Object.fromEntries(
    NEXI_MOBILE_ENV_KEYS.flatMap((key) => {
      const value = sources.map((source) => source[key]?.trim()).find(Boolean);
      return value ? [[key, value]] : [];
    }),
  );
}
