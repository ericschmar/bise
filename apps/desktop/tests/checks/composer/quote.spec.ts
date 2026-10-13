// composer/quote · bar 2.5 (docs/desktop-bar.md; the terminal's quote.rs) · his bug 3: "no ...
// quotes in the composer". Red first on today's window (set 1, d38f2df9). Now on the new app: bise
// main's real thread screen on the scripted core (harness FakeCore: a world whose main thread holds
// a 3-line answer), with its real composer (ThreadScreen's ThreadComposer).
// Real mouse and keys: drag across the answer, then type a question. Passes when a quote chip
// (composer.chip.<n>, data-kind=quote) goes in the field at the caret, before the words typed after
// it, its strip row names where it comes from ('❝ 1 “…”  bise · 3 lines': main as the thread draws it), and the words follow.
import { FakeCore, launchDesktop, test, expect } from '../../harness';
import { T, fieldText, press } from './target';
import { expectShown } from '../thread/shown';

const HOME = 'bise-home-00000000';
const ANSWER = 'le p99 monte quand la compaction de 14 h tourne.\n2,1 s au lieu de 300 ms pendant 12 min.\nalerts propose de la passer à 03:00.';
const agent = (name: string) => ({ name, main: name === 'main', status: 'idle', archived: false, title: '', purpose: '', since_ms: 1791100000000, waits: 0 });
const world = () => [
  {
    ev: 'prefs',
    prefs: {
      onboarded: true,
      theme: 'system',
      context: { shot: true, url: true, file: true, window_text: false },
      excluded_apps: [],
      quiet: { call: true, share: true, fullscreen: true, focus: true, batch_min: 20, away_card: true },
      voice: { fn_hold: true, fn_twice: 'spotlight', language: 'auto' },
      shots_keep_days: 7,
    },
  },
  { ev: 'projects', projects: [{ project: HOME, name: 'bise', path: '/nowhere', git: false, home: true, order: 0, agents: 1, working: 0, waits: 0, running: true }] },
  { ev: 'welcome', project: HOME, proto: 1, workspace: '/nowhere', name: 'bise' },
  { ev: 'agents', project: HOME, agents: [agent('main')] },
  {
    ev: 'thread',
    project: HOME,
    agent: 'main',
    entries: [
      { pos: 1, at_ms: 1791100001000, kind: 'user', text: "pourquoi le p99 d'ingest monte à 14 h ?" },
      { pos: 2, at_ms: 1791100002000, kind: 'agent', text: ANSWER },
    ],
    before: null,
    more: false,
  },
];

test('composer/quote: select an answer in the real thread, type: a quote chip at the caret, then the words', async () => {
  const core = new FakeCore(world() as unknown as ConstructorParameters<typeof FakeCore>[0]);
  const s = await launchDesktop({ core, route: `agent/${HOME}/main` });
  try {
    const { page } = s;
    const answer = page.getByTestId('thread.entry.2').locator('.th-md').first();
    await expect(answer, "main's answer is in the thread").toContainText('compaction de 14 h', { timeout: 10_000 });
    await expect(page.locator(T.field), 'the thread has its composer').toBeVisible();
    // its text in the DOM is not on screen (amb-win 35d08ae5): the row is painted and hit-testable
    await expectShown(page.getByTestId('thread.entry.2'), "main's answer");
    const b = await answer.boundingBox();
    if (!b) throw new Error('no answer box');
    // from inside the first word to the end of the last line, as a hand drags
    await page.mouse.move(b.x + 8, b.y + 8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.move(b.x + b.width - 4, b.y + b.height - 6, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const selected = await page.evaluate(() => String(window.getSelection()));
    expect(selected, 'the drag selected the answer').toContain('compaction de 14 h');
    await page.keyboard.type('pourquoi 03:00 ?');
    await press(page, 'End');
    const chip = page.locator(T.field).locator(T.chipQuote);
    await expect(chip, 'a quote chip in the field').toBeVisible({ timeout: 1500 });
    const chipFirst = await page.locator(T.field).evaluate((f, sel) => {
      const c = f.querySelector(sel);
      if (!c) return false;
      const r = document.createRange();
      r.selectNodeContents(f);
      r.setEndBefore(c);
      return r.toString().trim() === '';
    }, T.chipQuote);
    expect(chipFirst, 'the chip sits at the caret, before the words typed after it').toBe(true);
    await expect(page.getByTestId('composer.attach.1'), 'its row in the box names where it comes from, main as bise').toContainText('bise · ');
    expect(await page.locator(T.field).evaluate(fieldText)).toContain('pourquoi 03:00 ?');
  } finally {
    await s.close();
  }
});
