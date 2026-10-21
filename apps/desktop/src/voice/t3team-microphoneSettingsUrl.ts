/** The OS page where microphone access is granted; null where the platform has none to open. */
export function microphoneSettingsUrl(platform: NodeJS.Platform): string | null {
  if (platform === "win32") return "ms-settings:privacy-microphone";
  if (platform === "darwin") {
    return "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
  }
  return null;
}
