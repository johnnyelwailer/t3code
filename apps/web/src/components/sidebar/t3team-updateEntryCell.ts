/** The update-dialog table cell an entry renderer fills: the app column, or the providers column. */
export type UpdateEntryCell =
  | { readonly kind: "app"; readonly label: string }
  | { readonly kind: "providers" };
