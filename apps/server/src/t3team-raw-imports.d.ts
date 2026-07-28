/**
 * `?raw` imports (the bundler inlines the file's TEXT at build time). Used so a body that ships as
 * source to a user's workspace can still be a real, typechecked module here instead of a string.
 *
 * `string` is a PROMISE ONLY TWO OF OUR THREE LOADERS KEEP. vite (`vp test`) and `vp pack` (via
 * `scripts/t3team-rawTextPackPlugin.ts`) inline the text; plain `node` — the dev backend — ignores
 * the query and hands back the module's default EXPORT. Validate before you trust it, the way
 * `src/t3team-descriptionRewriteBody.ts` does. Trusting it blind scaffolded a stringified function
 * into user workspaces once already.
 */
declare module "*?raw" {
  const contents: string;
  export default contents;
}
