/**
 * The allowlisted generic field write behind labels / priority / fix-version drafts. A field not
 * named in {@link IssueFieldUpdate} cannot be sent: there is no free-form field map.
 */

type NameChange = {
  readonly add?: ReadonlyArray<string> | undefined;
  readonly remove?: ReadonlyArray<string> | undefined;
};

export type IssueFieldUpdate = {
  readonly labels?: NameChange | undefined;
  /** Priority name, e.g. "High". */
  readonly priority?: string | undefined;
  /** Fix versions by name. */
  readonly fixVersions?: NameChange | undefined;
};

export type IssueFieldUpdateBody = {
  readonly fields?: Record<string, unknown>;
  readonly update?: Record<string, ReadonlyArray<Record<string, unknown>>>;
};

const clean = (values: ReadonlyArray<string> | undefined): ReadonlyArray<string> => [
  ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
];

/** Jira `update` operations: `add`/`remove` are idempotent, so a repeated apply is harmless. */
function ops(
  change: NameChange,
  wrap: (value: string) => unknown,
): ReadonlyArray<Record<string, unknown>> {
  const add = clean(change.add);
  const remove = clean(change.remove);
  const overlap = add.filter((value) => remove.includes(value));
  if (overlap.length > 0) {
    throw new Error(`Cannot add and remove the same value: ${overlap.join(", ")}.`);
  }
  return [
    ...add.map((value) => ({ add: wrap(value) })),
    ...remove.map((v) => ({ remove: wrap(v) })),
  ];
}

/** Request body for `PUT /rest/api/3/issue/{key}`; throws when the update changes nothing. */
export function buildIssueFieldUpdateBody(update: IssueFieldUpdate): IssueFieldUpdateBody {
  const updateOps: Record<string, ReadonlyArray<Record<string, unknown>>> = {};
  const spaced = clean([...(update.labels?.add ?? []), ...(update.labels?.remove ?? [])]).filter(
    (label) => /\s/.test(label),
  );
  if (spaced.length > 0)
    throw new Error(`Jira labels cannot contain spaces: ${spaced.join(", ")}.`);
  const labels = update.labels ? ops(update.labels, (value) => value) : [];
  if (labels.length > 0) updateOps.labels = labels;
  const fixVersions = update.fixVersions ? ops(update.fixVersions, (name) => ({ name })) : [];
  if (fixVersions.length > 0) updateOps.fixVersions = fixVersions;
  const priority = update.priority?.trim();
  if (update.priority !== undefined && !priority) throw new Error("Priority name is empty.");

  if (Object.keys(updateOps).length === 0 && !priority) {
    throw new Error("The field update changes nothing.");
  }
  return {
    ...(priority ? { fields: { priority: { name: priority } } } : {}),
    ...(Object.keys(updateOps).length > 0 ? { update: updateOps } : {}),
  };
}

/** The Jira edit-screen field id and label to gate each part of an update on. */
export function issueFieldUpdateTargets(
  update: IssueFieldUpdate,
): ReadonlyArray<{ readonly id: string; readonly label: string }> {
  return [
    ...(update.labels ? [{ id: "labels", label: "Labels" }] : []),
    ...(update.priority !== undefined ? [{ id: "priority", label: "Priority" }] : []),
    ...(update.fixVersions ? [{ id: "fixVersions", label: "Fix versions" }] : []),
  ];
}
