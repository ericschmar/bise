// The attachment list inside the composer's box, above his words (designer's composer-attachments,
// his pick A; ambient-lead m_22590): one 28 px row per chip in the draft, in the order added, with
// the chip's own number (amb-feed m_22597: the number the model reads, never the row's place),
// its sign or 16 px thumbnail, its name (cut first) and its facts in text-3; ✕ on hover. A row and
// its chip in the text light each other; a click previews it (Quick Look, or the quote's place in
// the thread). Four rows, then the list scrolls.
import type { JSX } from "react";
import { IconButton } from "@/ds";
import { attachRow, type Chip } from "../message";

/** A quote row's click: the thread scrolls to the quoted words and flashes them (detail {from, text}). */
export const QUOTE_SOURCE_EVENT = "bise:quote-source";

export interface AttachListProps {
  readonly chips: readonly Chip[];
  /** the chip lit now (its row or its chip hovered, or the caret right after it) */
  readonly lit: number | null;
  readonly onLit: (n: number | null) => void;
  readonly onRemove: (n: number) => void;
  readonly onOpen: (c: Chip) => void;
  readonly home: string;
  readonly testId: string;
}

export function AttachList({ chips, lit, onLit, onRemove, onOpen, home, testId }: AttachListProps): JSX.Element | null {
  const rows = chips.flatMap((c) => {
    const r = attachRow(c, home);
    return r === null ? [] : [{ c, ...r }];
  });
  if (rows.length === 0) return null;
  return (
    <div className="b-attach" role="list" data-testid={`${testId}.attach`} onMouseLeave={() => { onLit(null); }}>
      {rows.map(({ c, name, info }) => (
        <div
          key={c.n}
          role="listitem"
          className={`b-attach-row${lit === c.n ? " lit" : ""}`}
          data-n={c.n}
          data-kind={c.kind}
          data-testid={`${testId}.attach.${String(c.n)}`}
          title={c.kind === "image" || c.kind === "file" ? c.path : undefined}
          onMouseEnter={() => { onLit(c.n); }}
          onMouseDown={(e) => { e.preventDefault(); /* the field keeps its caret */ }}
          onClick={() => { onOpen(c); }}
        >
          <span className="n">{c.n}</span>
          <Sign c={c} />
          <span className="nm">{name}</span>
          {info !== "" && <span className="in3">{info}</span>}
          <span className="x">
            <IconButton size="row" label={`remove ${String(c.n)}`} onClick={(e) => { e.stopPropagation(); onRemove(c.n); }} testId={`${testId}.attach.${String(c.n)}.remove`}>✕</IconButton>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The terminal's signs (❝ a quote, ▤ a paste, ▯ a file) or the 16 px thumbnail of an image or a file's icon. */
function Sign({ c }: { c: Chip }): JSX.Element {
  if (c.kind === "image" && c.thumb !== undefined) return <img className="sg th" src={c.thumb} alt="" draggable={false} />;
  if (c.kind === "file" && c.icon !== undefined) return <img className="sg th" src={c.icon} alt="" draggable={false} />;
  const g = c.kind === "quote" ? "❝" : c.kind === "paste" ? "▤" : c.kind === "image" ? "▣" : "▯";
  return <span className="sg" aria-hidden="true">{g}</span>;
}
