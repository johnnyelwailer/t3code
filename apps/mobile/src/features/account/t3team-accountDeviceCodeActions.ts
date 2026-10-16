import type { AccountStatus } from "@t3tools/contracts";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

/**
 * What the sign-in code offers on this phone: the code and the page address to take to ANOTHER
 * device. Nothing here opens the page on the phone: that is what the browser sign-in is for.
 */

const pendingCode = (status: AccountStatus) =>
  status.auth._tag === "SigningIn" && status.auth.userCode !== null
    ? { code: status.auth.userCode, uri: status.auth.verificationUri }
    : null;

export const copyDeviceCode = async (status: AccountStatus) => {
  const pending = pendingCode(status);
  if (pending !== null) await Clipboard.setStringAsync(pending.code);
};

export const copyVerificationLink = async (status: AccountStatus) => {
  const pending = pendingCode(status);
  if (pending?.uri) await Clipboard.setStringAsync(pending.uri);
};

/** The system share sheet with the page address and the code, for sending to the other device. */
export const shareVerificationLink = async (status: AccountStatus) => {
  const pending = pendingCode(status);
  if (pending?.uri) {
    await Share.share({ message: `Sign in at ${pending.uri} with the code ${pending.code}` });
  }
};
