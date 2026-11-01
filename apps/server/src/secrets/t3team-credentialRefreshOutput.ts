/** Reads the device code and page out of `gh auth refresh` output; nothing else from the output is kept. */
export interface DeviceCode {
  readonly userCode: string;
  readonly verificationUri: string;
}

const CODE = /(?<![/\w-])([A-Z0-9]{4}-[A-Z0-9]{4})\b/;
const URL_PATTERN = /(https:\/\/[^\s"'<>]{1,200})/;

/** Accumulates lines until both a code and an https page have been seen. */
export function deviceCodeReader() {
  let userCode: string | undefined;
  let verificationUri: string | undefined;
  return (line: string): DeviceCode | undefined => {
    userCode ??= /code/i.test(line) ? CODE.exec(line)?.[1] : undefined;
    verificationUri ??= URL_PATTERN.exec(line)?.[1];
    return userCode !== undefined && verificationUri !== undefined
      ? { userCode, verificationUri }
      : undefined;
  };
}
