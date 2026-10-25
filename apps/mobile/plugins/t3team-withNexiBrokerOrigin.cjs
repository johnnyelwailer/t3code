const { withAndroidManifest } = require("expo/config-plugins");

const BROKER_ORIGIN_KEY = "com.nexplore.nexiwork.NEXI_BROKER_ORIGIN";

/**
 * Bakes the broker's https origin into the manifest so the native broker module can refuse to send
 * the user's Entra bearer anywhere else, whatever JS asks for (see t3team-NexiStreamPolicy.kt).
 */
module.exports = function withNexiBrokerOrigin(config, { origin }) {
  if (typeof origin !== "string" || new URL(origin).protocol !== "https:") {
    throw new Error("The Nexi broker origin must be an https URL.");
  }
  return withAndroidManifest(config, (nextConfig) => {
    const application = nextConfig.modResults.manifest.application?.[0];
    if (application == null) {
      throw new Error("AndroidManifest.xml is missing the application element.");
    }
    const metaData = (application["meta-data"] ??= []).filter(
      (entry) => entry.$["android:name"] !== BROKER_ORIGIN_KEY,
    );
    metaData.push({
      $: { "android:name": BROKER_ORIGIN_KEY, "android:value": new URL(origin).origin },
    });
    application["meta-data"] = metaData;
    return nextConfig;
  });
};

module.exports.BROKER_ORIGIN_KEY = BROKER_ORIGIN_KEY;
