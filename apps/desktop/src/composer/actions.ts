// What the screen around a composer may ask of it (ComposerActions, handed over once mounted), and
// what its field tells the key bar (FieldBar). Types only.
import type { QuoteAt } from './message';

/** What the screen around a composer may ask of it (dictation, the send button, focus). */
export interface ComposerActions {
  submit(): void;
  /** Words at the caret (dictation's final text, a pick from elsewhere): editable, never sent. */
  insertText(text: string): void;
  /**
   * The field holds `text` alone, all of it selected, and has the focus (the first-run text's
   * "show me what you can do", BISE-284): typing replaces it, ⏎ sends it; never a send.
   */
  fill(text: string): void;
  focus(): void;
  /** The focus with the caret at the draft's end (a press on the frame's padding or empty area, his round 2). */
  focusEnd(): void;
  /** The mic control: on, or off when on (bar I). */
  dictate(): void;
  /**
   * Text selected in the thread, as a quote chip at the caret (`❝ 1`, its strip says `from` and its lines), then the focus.
   * `at`: lines of a diff (V7, diffquote.rs): the strip says 'src/a.rs:12-14 · 3 lines' and the tag carries file / new / old.
   */
  quote(text: string, from: string, at?: QuoteAt): void;
}

/** What the field tells the key bar: a list open, text selected, images, text in it. */
export interface FieldBar {
  readonly fileList: boolean;
  readonly selected: boolean;
  readonly images: boolean;
  /** chips in the draft: the key line says backspace on one removes it (composer-attachments A) */
  readonly chips?: boolean;
  readonly typing: boolean;
  /** dictation: the mic on, then its last words coming */
  readonly dictating: 'recording' | 'transcribing' | null;
}
