/**
 * `?raw` imports (the bundler inlines the file's TEXT at build time). Used so a body that ships as
 * source to a user's workspace can still be a real, typechecked module here instead of a string.
 */
declare module "*?raw" {
  const contents: string;
  export default contents;
}
