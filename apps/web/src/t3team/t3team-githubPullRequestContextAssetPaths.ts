function buildRelativePath(fromRelativePath: string, toRelativePath: string): string {
  const fromParts = fromRelativePath.split("/").filter(Boolean);
  const toParts = toRelativePath.split("/").filter(Boolean);
  fromParts.pop();
  let index = 0;
  while (
    index < fromParts.length &&
    index < toParts.length &&
    fromParts[index] === toParts[index]
  ) {
    index += 1;
  }
  return [...fromParts.slice(index).map(() => ".."), ...toParts.slice(index)].join("/") || ".";
}

function fileExtensionFromMimeType(value: string | undefined): string | undefined {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  switch (normalized) {
    case "image/apng":
    case "image/png":
      return ".png";
    case "image/avif":
      return ".avif";
    case "image/bmp":
      return ".bmp";
    case "image/gif":
      return ".gif";
    case "image/jpeg":
      return ".jpg";
    case "image/svg+xml":
      return ".svg";
    case "image/webp":
      return ".webp";
    default:
      return undefined;
  }
}

export function buildGitHubRemoteAssetRelativePath(
  root: string,
  sourceUrl: string,
  mimeType: string | undefined,
  index: number,
): string {
  const url = new URL(sourceUrl);
  const filename = url.pathname.split("/").pop() ?? "asset";
  const stem =
    filename
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/\.[^.]+$/, "")
      .replace(/^-+|-+$/g, "") || "asset";
  const extension =
    /\.[A-Za-z0-9]{1,8}$/.exec(filename)?.[0]?.toLowerCase() ??
    fileExtensionFromMimeType(mimeType) ??
    ".bin";
  return `${root}/pull-request/assets/${String(index + 1).padStart(3, "0")}-${stem}${extension}`;
}

export { buildRelativePath };
