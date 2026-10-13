// What he pastes or drops that isn't words (R41: the model sees the images he pastes): an image
// goes to bise's image store through main (window.bise.saveImage, src/main/images.ts) and its
// absolute path rides the send's image part; any other dropped or Finder-copied file goes by its
// own path as a file part (file-chips). Shared by the window's composer and the spotlight, so both
// attach the same way.
import { isImagePath, type SavedImage } from './sources';

/** window.bise when the page runs in bise's windows (unit tests have none). */
const bise = (): Window['bise'] | undefined => (window as { bise?: Window['bise'] }).bise;

/** An image the model reads: by its type, else by its name. */
export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || isImagePath(f.name);

/** A pasted or dropped image saved in bise's image store: its path and the name the chip shows; null when main refused it. */
export async function saveImageFile(f: File): Promise<SavedImage | null> {
  const api = bise();
  if (api?.saveImage === undefined) return null;
  const path = await api.saveImage(new Uint8Array(await f.arrayBuffer()));
  return path === null ? null : { path, name: f.name !== '' ? f.name : 'pasted.png' };
}

/** A dropped or Finder-copied file's absolute path ('' when it has none: made in the page). */
export function filePathOf(f: File): string {
  return bise()?.filePath(f) ?? '';
}

/** A file's 16 px system icon as a data URL (main's window.bise.fileIcon); null: none (▯). */
export async function fileIconOf(path: string): Promise<string | null> {
  const api = bise();
  if (api?.fileIcon === undefined) return null;
  return api.fileIcon(path);
}

/** A small thumbnail of an image as a data URL (48 px on its long side); null when it doesn't decode. */
/** An image's pixels (the attachment list's row says '1200×630'), null when it can't be read. */
export async function imageDims(f: File): Promise<{ w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(f);
    const d = { w: bmp.width, h: bmp.height };
    bmp.close();
    return d;
  } catch {
    return null;
  }
}

export async function thumbnail(f: File, side = 48): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}
