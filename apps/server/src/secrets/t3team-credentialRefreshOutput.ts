/** Reads the device code and page out of `gh auth refresh` output; nothing else from the output is kept. */
export interface DeviceCode {
  readonly userCode: string;
  readonly verificationUri: string;
}

const CODE = /(?<![/\w-])([A-Z0-9]{4}-[A-Z0-9]{4})\b/;
const URL_PATTERN = /https:\/\/[^\s"'<>]{1,200}/g;

/** Accumulates lines until a code and the host's own device page (`https://<host>/login/device`) were seen. */
export function deviceCodeReader(host: string) {
  const page = `https://${host}/login/device`;
  let userCode: string | undefined;
  let found = false;
  return (line: string): DeviceCode | undefined => {
    userCode ??= /code/i.test(line) ? CODE.exec(line)?.[1] : undefined;
    found ||= (line.match(URL_PATTERN) ?? []).some((url) => url.replace(/[.,;)]+$/, "") === page);
    return userCode !== undefined && found ? { userCode, verificationUri: page } : undefined;
  };
}
