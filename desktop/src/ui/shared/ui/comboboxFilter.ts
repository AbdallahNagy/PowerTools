export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text shown after the label, such as a logical name. Searched too. */
  description?: string;
  /** Options with the same group are listed under one heading, in first-seen order. */
  group?: string;
  disabled?: boolean;
}

/** Text the closed control shows for an option. */
export function comboboxOptionText(option: ComboboxOption): string {
  return option.description ? `${option.label} (${option.description})` : option.label;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function words(text: string): string[] {
  return text.split(/[\s_\-./()>]+/).filter(Boolean);
}

/**
 * Lower is better: exact label or value, then label or value prefix, then
 * every term starting a word, then plain substring matches. Null means the
 * option does not match.
 */
function score(option: ComboboxOption, query: string, terms: string[]): number | null {
  const label = normalize(option.label);
  const value = normalize(option.value);
  const description = normalize(option.description ?? "");
  const haystack = `${label} ${description} ${value}`;
  if (!terms.every((term) => haystack.includes(term))) return null;

  if (label === query || value === query || description === query) return 0;
  if (label.startsWith(query) || value.startsWith(query) || description.startsWith(query)) return 1;
  const haystackWords = words(haystack);
  if (terms.every((term) => haystackWords.some((word) => word.startsWith(term)))) return 2;
  return 3;
}

/**
 * Keeps options that contain every whitespace-separated term of the query in
 * their label, description, or value, ignoring case and accents. Matches are
 * ranked best first within each group; groups keep their order.
 */
export function filterComboboxOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const normalized = normalize(query.trim());
  if (!normalized) return options;
  const terms = normalized.split(/\s+/);

  const groupOrder = new Map<string | undefined, number>();
  const ranked: { option: ComboboxOption; group: number; score: number; index: number }[] = [];
  options.forEach((option, index) => {
    if (!groupOrder.has(option.group)) groupOrder.set(option.group, groupOrder.size);
    const result = score(option, normalized, terms);
    if (result === null) return;
    ranked.push({ option, group: groupOrder.get(option.group)!, score: result, index });
  });

  return ranked
    .sort((a, b) => a.group - b.group || a.score - b.score || a.index - b.index)
    .map((entry) => entry.option);
}
