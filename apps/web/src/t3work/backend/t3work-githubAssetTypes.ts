export type GitHubAssetDownloadRequest = {
  readonly host: string;
  readonly url: string;
};

export type GitHubDownloadedAsset = {
  readonly base64Contents: string;
  readonly mimeType?: string;
  readonly sizeBytes: number;
};
