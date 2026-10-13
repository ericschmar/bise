// The capsule's frame under BISE_DESKTOP_OFFSCREEN (ambient-lead m_22598, amb-tools m_22601):
// off-screen the capsule is parked at -30000 and never shown, so its window frame says nothing
// about where the corner card would sit. Each show and each move while shown appends one JSON
// line to userData/CAPSULE_FRAMES_FILE: where place.ts would put it on the display under his
// cursor (`bounds`, with that display's `work` area, `screen` and `dock`), and where it is parked
// (`parked`). Only with the knob (offscreen.ts); never in his normal launch, never in test mode
// (stdout's CAPSULE_LINE there). Nothing is shown and nothing moves: the display is only read.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapsuleAt } from '../shared/api';
import { dockOf, type DisplayBox, type Rect } from './place';

export const CAPSULE_FRAMES_FILE = 'capsule-frames.jsonl';

export interface CapsuleFrame {
  /** ms since the epoch */
  readonly t: number;
  /** 'show': a show placed it; 'move': a new size while shown */
  readonly ev: 'show' | 'move';
  /** 'corner' for the fn talk card; 'center' for the anchors centred on the display (top, bottom, menu) */
  readonly mode: 'corner' | 'center';
  readonly at: CapsuleAt;
  /** the window's frame place.ts gives on the real display */
  readonly bounds: Rect;
  readonly work: Rect;
  readonly screen: Rect;
  readonly dock: ReturnType<typeof dockOf>;
  /** the window's real frame: off every display */
  readonly parked: Rect;
}

/** Where the records go: userData with the off-screen knob (isOffscreen: never in test mode), else none. Pure. */
export function capsuleFramesDir(offscreen: boolean, testMode: boolean, userData: string): string | null {
  return offscreen && !testMode ? userData : null;
}

/** One record. Pure. */
export function capsuleFrame(t: number, ev: CapsuleFrame['ev'], at: CapsuleAt, bounds: Rect, d: DisplayBox, parked: Rect): CapsuleFrame {
  return { t, ev, mode: at === 'corner' ? 'corner' : 'center', at, bounds, work: d.workArea, screen: d.bounds, dock: dockOf(d), parked };
}

/** Appends one record as a line to `dir`/CAPSULE_FRAMES_FILE; a write that fails says so on stderr, nothing else. */
export function appendCapsuleFrame(dir: string, f: CapsuleFrame): void {
  try {
    appendFileSync(join(dir, CAPSULE_FRAMES_FILE), `${JSON.stringify(f)}\n`);
  } catch (e) {
    process.stderr.write(`bise-desktop: capsule-frames: ${String(e)}\n`);
  }
}
