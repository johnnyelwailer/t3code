/**
 * The `rich-choice` widget payload (`t3_show_widget` with `format: "rich-choice"`): validated by
 * the server before it is shown and decoded by the web client before it is rendered, so both sides
 * share one definition. Pure, no dependencies.
 */

export interface RichChoicePayloadOption {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tag?: string;
  readonly chips?: ReadonlyArray<string>;
}

export interface RichChoicePayload {
  readonly prompt: string;
  readonly options: ReadonlyArray<RichChoicePayloadOption>;
  readonly multiple?: boolean;
  readonly default_id?: string;
}

export const RICH_CHOICE_MAX_OPTIONS = 12;
const MAX = {
  id: 64,
  title: 80,
  tag: 24,
  body: 1_500,
  prompt: 200,
  chip: 40,
  chips: 6,
};
const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const PICK_IDS = /\(ids: ([A-Za-z0-9_.:, -]+)\)$/;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function text(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): string | { error: string } {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") return { error: `${field} must be a string.` };
  const trimmed = value.trim();
  if (required && trimmed.length === 0) return { error: `${field} is required.` };
  if (trimmed.length > max) return { error: `${field} exceeds ${max} characters.` };
  return trimmed;
}

function parseOption(raw: unknown, index: number): RichChoicePayloadOption | { error: string } {
  const where = `choice.options[${index}]`;
  const option = record(raw);
  if (!option) return { error: `${where} must be an object.` };
  const id = text(option.id, `${where}.id`, MAX.id, true);
  if (typeof id !== "string") return id;
  if (!ID_PATTERN.test(id))
    return { error: `${where}.id may use letters, digits and _ . : - only.` };
  const title = text(option.title, `${where}.title`, MAX.title, true);
  if (typeof title !== "string") return title;
  const body = text(option.body, `${where}.body`, MAX.body, true);
  if (typeof body !== "string") return body;
  if (option.image !== undefined) return { error: `${where}.image is not supported yet.` };
  const tag = text(option.tag, `${where}.tag`, MAX.tag, false);
  if (typeof tag !== "string") return tag;
  let chips: string[] | undefined;
  if (option.chips !== undefined) {
    if (!Array.isArray(option.chips) || option.chips.length > MAX.chips) {
      return { error: `${where}.chips must be an array of at most ${MAX.chips} strings.` };
    }
    chips = [];
    for (const [chipIndex, chip] of option.chips.entries()) {
      const value = text(chip, `${where}.chips[${chipIndex}]`, MAX.chip, true);
      if (typeof value !== "string") return value;
      chips.push(value);
    }
  }
  return {
    id,
    title,
    body,
    ...(tag ? { tag } : {}),
    ...(chips && chips.length > 0 ? { chips } : {}),
  };
}

/** Validate and normalise a payload (trimmed strings, empty optionals dropped). */
export function parseRichChoicePayload(
  input: unknown,
):
  | { readonly ok: true; readonly payload: RichChoicePayload }
  | { readonly ok: false; readonly error: string } {
  const raw = record(input);
  if (!raw) return { ok: false, error: "choice must be an object with prompt and options." };
  const prompt = text(raw.prompt, "choice.prompt", MAX.prompt, true);
  if (typeof prompt !== "string") return { ok: false, error: prompt.error };
  if (!Array.isArray(raw.options) || raw.options.length === 0) {
    return { ok: false, error: "choice.options must be a non-empty array." };
  }
  if (raw.options.length > RICH_CHOICE_MAX_OPTIONS) {
    return {
      ok: false,
      error: `choice.options allows at most ${RICH_CHOICE_MAX_OPTIONS} options.`,
    };
  }
  const options: RichChoicePayloadOption[] = [];
  for (const [index, entry] of raw.options.entries()) {
    const option = parseOption(entry, index);
    if ("error" in option) return { ok: false, error: option.error };
    if (options.some((existing) => existing.id === option.id)) {
      return { ok: false, error: `choice.options ids must be unique ('${option.id}' repeats).` };
    }
    options.push(option);
  }
  if (raw.multiple !== undefined && typeof raw.multiple !== "boolean") {
    return { ok: false, error: "choice.multiple must be a boolean." };
  }
  const defaultId = raw.default_id;
  if (defaultId !== undefined) {
    if (typeof defaultId !== "string" || !options.some((option) => option.id === defaultId)) {
      return { ok: false, error: "choice.default_id must be the id of one of the options." };
    }
  }
  return {
    ok: true,
    payload: {
      prompt,
      options,
      ...(raw.multiple === true ? { multiple: true } : {}),
      ...(typeof defaultId === "string" ? { default_id: defaultId } : {}),
    },
  };
}

/** The text a pick returns to the agent. Ids are the contract; titles are for the reader. */
export function formatRichChoicePick(
  payload: RichChoicePayload,
  pickedIds: ReadonlyArray<string>,
): string {
  const titles = pickedIds.map((id) => payload.options.find((o) => o.id === id)?.title ?? id);
  return `Chose ${titles.join(", ")} (ids: ${pickedIds.join(", ")})`;
}

/** The ids in a pick message: the trailing `(ids: …)`, so a title that quotes one cannot spoof it. */
export function parseRichChoicePickIds(
  payload: RichChoicePayload,
  text: string,
): ReadonlyArray<string> | null {
  const match = PICK_IDS.exec(text.trim());
  if (!match?.[1]) return null;
  const ids = match[1].split(",").map((id) => id.trim());
  const known = new Set(payload.options.map((option) => option.id));
  const unique = [...new Set(ids)];
  return unique.length > 0 && unique.every((id) => known.has(id)) ? unique : null;
}
