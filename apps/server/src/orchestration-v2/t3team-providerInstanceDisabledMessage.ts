/** Names the provider and the two places to turn it back on, since the toast is all the user sees. */
export function providerInstanceDisabledMessage(instanceId: string, projectId: string): string {
  return (
    `The "${instanceId}" provider is turned off for this project (${projectId}), so nothing ran. ` +
    "Turn it on in Settings → Providers or in this project's provider settings, " +
    "or switch this thread to another provider."
  );
}
