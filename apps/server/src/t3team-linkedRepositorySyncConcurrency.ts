/** How many linked repositories are cloned, fetched or remotely inspected at once. Its own module
 * so the main-repository inspection can share it without importing the sync service (which would
 * close an import cycle through the bootstrap modules). */
export const LINKED_REPOSITORY_SYNC_CONCURRENCY = 3;
