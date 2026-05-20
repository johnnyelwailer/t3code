export function buildAtlassianAssetContentUrl(input: {
  accountId: string;
  url: string;
  workspaceRoot?: string;
  relativePath?: string;
}): string {
  const params = new URLSearchParams({
    accountId: input.accountId,
    url: input.url,
  });

  if (input.workspaceRoot) {
    params.set("workspaceRoot", input.workspaceRoot);
  }
  if (input.relativePath) {
    params.set("relativePath", input.relativePath);
  }

  return `/api/t3work/atlassian/asset/content?${params.toString()}`;
}
