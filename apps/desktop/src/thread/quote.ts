// Quoting the thread (his bug 3, parity M6/B7; the TUI's quote.rs and
// input.rs:415): text selected in the thread, then a key typed, goes into the
// composer as a quote chip (`❝ 1`, its strip 'first words… main · 3 lines')
// followed by that key; tab (the TUI's key) and ⌘' quote without typing. Pure rules here; the
// listeners are in ThreadScreen. Owner: amb-win.

export interface KeyLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  /** the physical key (KeyboardEvent.code); the ⌥ digits are read by it */
  readonly code?: string;
}

const GRAPHEMES = new Intl.Segmenter();

/**
 * What a key does to a selection in the thread: 'type' (a printable key: the
 * quote goes in, then the key), 'quote' (⌘': the quote alone), or nothing
 * (moves, copies, the window's keys). Pure.
 */
export function quoteKey(e: KeyLike & { readonly shiftKey?: boolean }): 'type' | 'quote' | undefined {
  if (e.metaKey && !e.ctrlKey && !e.altKey && e.key === "'") return 'quote';
  // tab: the quote alone, the TUI's key (main m_12004, quote-keys)
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && e.shiftKey !== true) return 'quote';
  if (e.metaKey || e.ctrlKey) return undefined;
  // ⌥0-9 are the window's agent keys (app/keys.ts, read by code: ⌥1 types '¡'), never a quote (his bug on cb1f2b44, m_14132)
  if (e.altKey && e.code !== undefined && /^Digit[0-9]$/.test(e.code)) return undefined;
  // one character (a letter, a digit, a space, an accent typed with ⌥): his words begin
  return Array.from(GRAPHEMES.segment(e.key)).length === 1 ? 'type' : undefined;
}

/** Who said the quoted words, as the TUI's strip names them: his row is 'you', any other the agent's. Pure. */
export function quoteFrom(rowKind: string | null | undefined, rowFrom: string | null | undefined, agent: string): string {
  if (rowKind === 'you') return 'you';
  if (rowKind === 'from_agent' && rowFrom != null && rowFrom !== '') return rowFrom;
  return agent;
}

/** The selected words, as they read (trailing blank lines dropped), or '' when there's nothing to quote. Pure. */
export function quoteText(selected: string): string {
  return selected.replace(/\s+$/u, '').trim() === '' ? '' : selected.replace(/\n+$/u, '');
}

/** The entry a quote came from: the newest whose text holds the quote's first words (whitespace
 *  folded); null when it isn't in the pages held. The attachment list's quote row scrolls to it. */
export function quoteSourcePos(
  store: { threadOrder(key: string): { readonly order: readonly number[] }; entry(key: string, pos: number): { readonly text: string } | undefined },
  key: string,
  quote: string,
): number | null {
  const fold = (s: string): string => s.replace(/\s+/gu, ' ').trim();
  const head = fold(quote).slice(0, 80);
  if (head === '') return null;
  const order = store.threadOrder(key).order;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const pos = order[i];
    if (pos === undefined) continue;
    const e = store.entry(key, pos);
    if (e !== undefined && fold(e.text).includes(head)) return pos;
  }
  return null;
}
