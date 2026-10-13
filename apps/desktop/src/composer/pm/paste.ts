// The field's paste, drop and clipboard, out of PmField.tsx: images as chips (pasted, dropped on
// the field or anywhere in the window), any other file on disk as a file chip by its path
// (file-chips), a long text as a chip after it lands inline (⌘Z puts it
// back inline), any other text as plain text; a copy reads chips as their labels.
import { useEffect, useEffectEvent } from "react";
import { closeHistory } from "@tiptap/pm/history";
import {
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import { chipLabel, isLongPaste, nextChipNumber, type Chip } from "../message";
import { type ComposerSources } from "../sources";
import { fileIconOf, filePathOf, imageDims, isImageFile, thumbnail } from "../attach";
import { insertChip, insertText, nodeType, segmentsOf } from "./pmtext";

/** What paste and drop need of the field: read at each use (the editor and props live in refs). */
export interface PasteCtx {
  readonly sources: () => ComposerSources;
  readonly state: () => EditorState | null;
  readonly dispatch: (tr: Transaction | null) => boolean;
  readonly view: () => EditorView | null;
}

/** What the clipboard reads of a selection: chips as their labels, a newline '\n', no dictation. */
export function clipboardText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, "\n", (n) =>
    n.type.name === "hardBreak"
      ? "\n"
      : n.type.name === "chip"
        ? chipLabel(n.attrs.chip as Chip)
        : "",
  );
}

const addChip = (c: PasteCtx, make: (n: number) => Chip): void => {
  const st = c.state();
  if (st !== null)
    c.dispatch(insertChip(st, make(nextChipNumber(segmentsOf(st.doc)))));
};

/** An image's chip: the image in the store, its thumbnail; null when the store refuses it. */
const imageChip = async (
  c: PasteCtx,
  f: File,
): Promise<((n: number) => Chip) | null> => {
  const [img, thumb, dims] = await Promise.all([
    c.sources().saveImage(f),
    thumbnail(f),
    imageDims(f),
  ]);
  if (img === null) return null;
  return (n) => ({
    kind: "image",
    n,
    path: img.path,
    name: img.name,
    ...(thumb === null ? {} : { thumb }),
    ...(dims === null ? {} : dims),
    bytes: f.size,
  });
};

/** A file that isn't an image, as a file chip by its absolute path (file-chips): its system icon
 *  when main gives one, else ▯. One with no path (made in the page) is left out. */
const fileChip = async (f: File): Promise<((n: number) => Chip) | null> => {
  const path = filePathOf(f);
  if (path === "") return null;
  const icon = await fileIconOf(path);
  return (n) => ({
    kind: "file",
    n,
    path,
    bytes: f.size,
    ...(icon === null ? {} : { icon }),
  });
};

/** Files as the composer takes them, in their order (each chip where the one before it ended,
 *  numbered in that order, one space between two: chips are words in his text, designer
 *  m_21957): images to the store, any other file a file chip. */
const addAll = (c: PasteCtx, list: readonly File[]): void => {
  void (async () => {
    let added = false;
    for (const f of list) {
      const make = isImageFile(f) ? await imageChip(c, f) : await fileChip(f);
      if (make === null) continue;
      const st = c.state();
      if (added && st !== null) c.dispatch(insertText(st, " "));
      addChip(c, make);
      added = true;
    }
  })();
};

const droppedFiles = (e: DragEvent): File[] =>
  Array.from(e.dataTransfer?.files ?? []);

/** A long paste: inline first, then its chip in a second undo step (⌘Z puts it back inline). */
const longPaste = (c: PasteCtx, raw: string): void => {
  const text = raw.replace(/\r\n?/gu, "\n");
  const st = c.state();
  if (st === null) return;
  const start = st.selection.from;
  c.dispatch(closeHistory(insertText(st, text).setMeta("paste", true)));
  const now = c.state();
  if (now === null) return;
  const chip: Chip = {
    kind: "paste",
    n: nextChipNumber(segmentsOf(now.doc)),
    text,
  };
  const tr = now.tr.replaceWith(
    start,
    start + text.length,
    nodeType(now.schema, "chip").create({ chip }),
  );
  tr.setSelection(TextSelection.create(tr.doc, start + 1));
  c.dispatch(closeHistory(tr));
};

/** A paste in the field (or anywhere, through grab.ts): true, it was handled. */
export function pasteInto(c: PasteCtx, e: ClipboardEvent): boolean {
  const data = e.clipboardData;
  if (data === null) return false;
  // a pasted image, or files copied in Finder (each by its path: a file chip, an image chip)
  const files = Array.from(data.files).filter(
    (f) => f.type.startsWith("image/") || filePathOf(f) !== "",
  );
  if (files.length > 0) {
    e.preventDefault();
    addAll(c, files);
    return true;
  }
  const text = data.getData("text/plain");
  e.preventDefault();
  if (isLongPaste(text)) {
    longPaste(c, text);
    return true;
  }
  const st = c.state();
  if (st !== null && text !== "")
    c.dispatch(
      insertText(st, text.replace(/\r\n?/gu, "\n")).setMeta("paste", true),
    );
  return true;
}

/** A drop on the field: its images and files as chips; false (no file): ProseMirror's own. */
export function dropInto(c: PasteCtx, e: DragEvent): boolean {
  const files = droppedFiles(e);
  if (files.length === 0) return false;
  e.preventDefault();
  addAll(c, files);
  return true;
}

/** A file dropped anywhere in the window is the composer's, never a navigation. */
export function useDropAnywhere(c: PasteCtx): void {
  // registered once; the drop sees this render's context
  const drop = useEffectEvent((e: DragEvent): void => {
    e.preventDefault();
    if (c.view()?.dom.contains(e.target as Node) === true) return; // handleDrop has it
    const files = droppedFiles(e);
    if (files.length > 0) addAll(c, files);
  });
  useEffect(() => {
    const over = (e: DragEvent): void => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent): void => {
      drop(e);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
