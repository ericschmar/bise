// The field's schema as TipTap extensions: one paragraph of inline nodes (pmtext.ts reads it).
//   - text, no marks: markdown stays characters (the wire is the TUI's text); its colors are
//     decorations, never marks, so a color never changes the document;
//   - hardBreak: a newline (⇧⏎, a pasted line) as one position, the old engine's line break;
//   - chip: an image, a long paste, a quote, an artifact; an inline atom, one caret step, one
//     backspace; its data (message.ts Chip) is the node's `chip` attribute;
//   - dictation: where his words go while he talks, showing them live; read by nothing (not the
//     send, not the draft), replaced by the words when the last ones come.
// The node views are plain DOM (no React portal), drawn once per node: typing never renders React.
import { Node } from '@tiptap/core';
import { chipLabel, type Chip } from '../message';

export const Doc = Node.create({ name: 'doc', topNode: true, content: 'paragraph' });

export const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: () => ['p', { class: 'p' }, 0],
});

export const Text = Node.create({ name: 'text', group: 'inline' });

export const HardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: 'br' }],
  renderHTML: () => ['br'],
  renderText: () => '\n',
});

/** A chip's DOM, the old engine's (composer.chip.<n>, data-kind, the image's thumbnail). */
export function chipDom(c: Chip): HTMLElement {
  const el = document.createElement('span');
  el.className = `b-chip ${c.kind}`;
  el.dataset.testid = `composer.chip.${c.n}`;
  el.dataset.kind = c.kind;
  el.dataset.n = String(c.n);
  el.contentEditable = 'false';
  if (c.kind === 'image') {
    // the attachment list's number beside the 16 px thumbnail (else the no-file glyph slot), its
    // name in the list's row (designer's composer-attachments A); '[Image #1]' stays the copied text
    el.title = c.name;
    el.append(c.thumb !== undefined ? thumbImg(c.thumb) : noFileGlyph());
    el.append(String(c.n));
    return el;
  }
  if (c.kind === 'file') {
    // '▯ 3' (or the file's 16 px system icon and 3): its name and size in the list's row
    // (designer's composer-attachments A); '[File #3]' is the copied text
    el.title = c.path;
    el.append(c.icon !== undefined ? thumbImg(c.icon) : fileGlyph());
    el.append(String(c.n));
    return el;
  }
  el.append(chipLabel(c));
  return el;
}

/** A file chip's glyph slot when the system gives no icon: ▯, 16 px (the TUI's G_FILE). */
export function fileGlyph(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'thumb file';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '▯';
  return span;
}

/** An image chip's words on the input side: 'image 1', as his sent bubble shows it. Pure. */
export const imageChipWords = (n: number): string => `image ${String(n)}`;

function thumbImg(src: string): HTMLElement {
  const img = document.createElement('img');
  img.className = 'thumb';
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** The no-file glyph slot of the thread's Thumb (rows-cards.tsx): a faint image outline, 16 px. */
function noFileGlyph(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'thumb none';
  span.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  const shapes: [string, Record<string, string>][] = [
    ['rect', { x: '2.5', y: '3.5', width: '11', height: '9', rx: '1.5', fill: 'none', stroke: 'currentColor' }],
    ['circle', { cx: '6', cy: '6.5', r: '1', fill: 'currentColor' }],
    ['path', { d: 'M3 11.5l3.5-3 2.5 2 2-1.5 2.5 2', fill: 'none', stroke: 'currentColor' }],
  ];
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    svg.append(s);
  }
  span.append(svg);
  return span;
}

export const ChipNode = Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes: () => ({ chip: { default: null, rendered: false } }),
  renderHTML: ({ node }) => ['span', { class: 'b-chip' }, chipLabel(node.attrs.chip as Chip)],
  renderText: ({ node }) => chipLabel(node.attrs.chip as Chip),
  addNodeView: () => ({ node }) => ({ dom: chipDom(node.attrs.chip as Chip), ignoreMutation: () => true }),
});

/** The live words as the dictation node shows them: `lead` (a space after a word, dictate.ts
 *  dictated) then the words, or 'listening…' before the first ('transcribing…' once the mic is
 *  off: a batch listener gives every word at the end, for as long as it takes). */
export const dictationLabel = (text: string, lead: string, wait = false): string =>
  text.trim() === '' ? `${lead}${wait ? 'transcribing…' : 'listening…'}` : `${lead}${text.trim()}`;
const labelOf = (n: { attrs: Record<string, unknown> }): string => dictationLabel(n.attrs.text as string, n.attrs.lead as string, n.attrs.wait === true);

/** A take that came back with no words or an error, the core keeping it (designer m_22396): its line. */
export const FAILED = {
  noWords: "didn't catch any words",
  error: (reason: string): string => `couldn't transcribe it${reason === '' ? '' : ` (${reason})`}`,
  retry: 'try again',
  retryKey: '⌥⏎',
  drop: 'esc drops it',
} as const;
/** The core's error, short for the line: no final period. Pure. */
export const shortReason = (error: string | null): string => (error ?? '').trim().replace(/\.$/u, '');
/** The node's 'try again' asks its take again through this event (dictation.ts listens), its detail the take's id. */
export const RETRY_EVENT = 'b-dictate-retry';

const el = (tag: string, cls: string, text: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls !== '') e.className = cls;
  e.textContent = text;
  return e;
};

/** The failed take's line: '▲ couldn't transcribe it (…)' or 'didn't catch any words', then
 *  'try again ⌥⏎' (a click does it) and 'esc drops it'. */
function failedLine(dom: HTMLElement, id: string, lead: string, reason: string | null): void {
  const parts: (HTMLElement | string)[] = [lead];
  if (reason !== null) parts.push(el('span', 'warn', '▲'), ' ');
  parts.push(el('span', 'w', reason === null ? FAILED.noWords : FAILED.error('')));
  if (reason !== null && reason !== '') {
    // the reason is the part that cuts (fitFailed): '(the transcription ti…)', then none
    const why = el('span', 'why', ` (${reason})`);
    why.dataset.full = reason;
    parts.push(why);
  }
  const retry = el('span', 'retry', FAILED.retry);
  retry.setAttribute('role', 'button');
  retry.dataset.testid = 'composer.dictation.retry';
  // the field keeps its caret; the click asks the take again
  retry.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  retry.addEventListener('click', (e) => {
    e.preventDefault();
    retry.dispatchEvent(new CustomEvent(RETRY_EVENT, { bubbles: true, detail: id }));
  });
  // '· try again ⌥⏎ · esc drops it' never cuts or wraps (designer m_22494)
  const tail = el('span', 'tail', ' · ');
  tail.append(retry, ' ', el('span', 'k', FAILED.retryKey), ' · ', el('span', 'k-what', FAILED.drop));
  parts.push(tail);
  dom.replaceChildren(...parts);
}

/** A failed take's line stays one line (designer m_22494): its reason cuts with … first, then
 *  drops whole. Measured where it sits (the words typed before it move it), so after each change
 *  of the field and each change of its width. No layout (jsdom): left whole. */
export function fitFailed(dom: HTMLElement): void {
  const why = dom.querySelector<HTMLElement>('.why');
  const full = why?.dataset.full;
  if (why === null || full === undefined) return;
  const fits = (): boolean => dom.getClientRects().length <= 1;
  const cut = (n: number): string => ` (${full.slice(0, n).trimEnd()}…)`;
  why.textContent = ` (${full})`;
  if (fits()) return;
  // the longest cut that fits (at least one letter), else no reason at all
  let lo = 1;
  let hi = full.length - 1;
  let best = 0;
  while (lo <= hi) {
    const n = Math.floor((lo + hi) / 2);
    why.textContent = cut(n);
    if (fits()) {
      best = n;
      lo = n + 1;
    } else hi = n - 1;
  }
  why.textContent = best > 0 ? cut(best) : '';
}
/** Every failed line in the field, fitted again. */
export const fitFailedIn = (root: HTMLElement): void => {
  root.querySelectorAll<HTMLElement>('.b-dictation[data-failed]').forEach(fitFailed);
};

export const DictationNode = Node.create({
  name: 'dictation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  // id: its take (a new take may start while an older one is still transcribed); wait: the mic is
  // off; failed: its final had no words or an error and the core kept it ('try again'), reason:
  // the error, short ('': no words)
  addAttributes: () => ({
    text: { default: '', rendered: false },
    lead: { default: '', rendered: false },
    id: { default: '', rendered: false },
    wait: { default: false, rendered: false },
    failed: { default: false, rendered: false },
    reason: { default: '', rendered: false },
  }),
  renderHTML: () => ['span', { class: 'b-dictation' }],
  renderText: () => '',
  addNodeView:
    () =>
    ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'b-dictation';
      dom.dataset.testid = 'composer.dictation';
      dom.contentEditable = 'false';
      const dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      const words = document.createElement('span');
      words.className = 'w';
      let failed = false;
      const draw = (n: typeof node): void => {
        failed = n.attrs.failed === true;
        dom.toggleAttribute('data-failed', failed);
        if (failed) {
          failedLine(dom, n.attrs.id as string, n.attrs.lead as string, n.attrs.reason === '' ? null : (n.attrs.reason as string));
          // in the page by the next frame: fitted where it sits
          requestAnimationFrame(() => {
            fitFailed(dom);
          });
        }
        else {
          words.textContent = labelOf(n);
          dom.replaceChildren(dot, words);
        }
      };
      draw(node);
      return {
        dom,
        ignoreMutation: () => true,
        // a new partial changes only the words' text: the node's DOM stays the same node
        update: (next) => {
          if (next.type.name !== 'dictation') return false;
          if (failed || next.attrs.failed === true) {
            draw(next);
            return true;
          }
          const w = labelOf(next);
          if (words.textContent !== w) words.textContent = w;
          return true;
        },
      };
    },
});

/** Every node of the field, in one list (the editor's and the tests' schema). */
export const FIELD_NODES = [Doc, Paragraph, Text, HardBreak, ChipNode, DictationNode];
