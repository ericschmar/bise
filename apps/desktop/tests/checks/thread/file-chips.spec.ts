// thread/file-chips · file-chips (main m_21747, m_21751; architect m_21764, designer m_21765).
// The REAL thread screen on the scripted core. Owner: file-chips (amb-web's composer, amb-win's
// bubble). Passes when:
//   - a Finder drop (CDP's real drag-and-drop) of an image, a pdf, a csv, an xlsx, a docx and a
//     pptx on bise main's composer makes one chip each: the image an image chip, each document a
//     file chip (data-kind=file) with its name and the ▯ slot (test mode: no system icon), the
//     image chip's look (ink, 1 px line, r 9, no fill), no strip line;
//   - ⏎ sends parts in order: the image part (its source in the store) and one
//     {kind:'file', name:'[File #N]', path:<absolute>} per document where its chip was, no files;
//   - his bubble (the hub's entry, as after a reload) draws a chip per file, '· missing' on the
//     one the hub found gone, only 'missing' in the err tone; a click on a file chip is Quick Look
//     (test mode's 'bise-desktop: quicklook <path>'), a right-click shows it in Finder, the gone
//     one opens nothing; the image chip previews too (Benjamin's ask).
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { FakeCore, test, expect } from '../../harness';
import { dropFiles } from '../../harness/inputs';
import { onWorld } from '../native/world';

const HOME = 'bise-home-00000000';
const ROOT = mkdtempSync(path.join(tmpdir(), 'file-chips-'));
const DOCS = ['q3.pdf', 'data.csv', 'plan.xlsx', 'brief.docx', 'deck.pptx'];
const LOGO = path.join(ROOT, 'logo.png');
copyFileSync(path.join(__dirname, '../fixtures/checker.png'), LOGO);
for (const d of DOCS) writeFileSync(path.join(ROOT, d), `fake ${d}`);
const at = (d: string): string => path.join(ROOT, d);
test.afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

// shots at 1100, light then dark (designer m_21765)
const prefs = (theme: string) => ({
  ev: 'prefs',
  prefs: { onboarded: true, theme, context: { shot: true, url: true, file: true, window_text: false }, excluded_apps: [], quiet: { call: true, share: true, fullscreen: true, focus: true, batch_min: 20, away_card: true }, voice: { fn_hold: true, fn_twice: 'spotlight', language: 'auto' }, shots_keep_days: 7 },
});
const world = () => [
  prefs('light'),
  { ev: 'projects', projects: [{ project: HOME, name: 'bise', path: ROOT, git: false, home: true, order: 0, agents: 1, working: 0, waits: 0, running: true }] },
  { ev: 'welcome', project: HOME, proto: 1, workspace: ROOT, name: 'bise' },
  { ev: 'agents', project: HOME, agents: [{ name: 'main', main: true, status: 'idle', archived: false, title: '', purpose: '', since_ms: 1791100000000, waits: 0 }] },
  { ev: 'thread', project: HOME, agent: 'main', entries: [{ pos: 1, at_ms: 1791100001000, kind: 'agent', text: 'hi. what are we doing today?' }], before: null, more: false },
];

test('thread/file-chips: a drop of documents makes file chips, ⏎ sends each where it was, the bubble opens them', async () => {
  await onWorld(
    async ({ s, core, out }) => {
      const { page } = s;
      const field = page.getByTestId('composer.field');
      await expect(field, "bise main's composer").toBeVisible({ timeout: 10_000 });
      await field.click();
      await page.keyboard.type('ajouter les fichiers ');
      await dropFiles(page, '[data-testid="composer.field"]', [LOGO, ...DOCS.map(at)]);
      const files = page.locator('[data-testid^="composer.chip."][data-kind="file"]');
      await expect(files, 'one file chip per document').toHaveCount(DOCS.length, { timeout: 5000 });
      await expect(page.locator('[data-testid^="composer.chip."][data-kind="image"]'), 'the image is an image chip').toHaveCount(1, { timeout: 5000 });
      // the chip says '▯ n', its name is its row in the box (designer's composer-attachments A)
      const names = await page.locator('[data-testid^="composer.attach."][data-kind="file"] .nm').allInnerTexts();
      expect(names, 'each document has its row with its file name, in the drop order').toEqual(DOCS);
      const order = await page.locator('[data-testid^="composer.chip."]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
      expect(order, 'the image first, as dropped').toEqual(['image', ...DOCS.map(() => 'file')]);
      // words in his text: one space between two chips, never under 4 px (designer m_21957)
      const gaps = await page.locator('[data-testid^="composer.chip."]').evaluateAll((els) =>
        els.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().left - (els[i]?.getBoundingClientRect().right ?? 0))),
      );
      for (const g of gaps) expect(g, `chips ${JSON.stringify(gaps)} px apart`).toBeGreaterThanOrEqual(4);
      const look = await files.first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, glyph: el.querySelector('.thumb.file')?.textContent ?? '' };
      });
      expect(look, "the image chip's look, the ▯ slot (no system icon in test mode)").toEqual({ bg: 'rgba(0, 0, 0, 0)', border: '1px', radius: '9px', glyph: '▯' });
      await expect(page.locator('[data-testid^="composer.strip."]').filter({ hasText: '▯' }), 'no strip line for a file: its chip says it').toHaveCount(0);
      await shots(page, core, 'composer');

      await page.keyboard.press('Enter');
      const sent = (await core.waitCmd((c) => c.cmd === 'send', 5000)) as Record<string, unknown>;
      expect(sent['files'], 'never a files list').toBeUndefined();
      const parts = (sent['parts'] ?? []) as Record<string, unknown>[];
      const fileParts = parts.filter((p) => p['kind'] === 'file');
      expect(fileParts.map((p) => path.basename(String(p['path']))).sort()).toEqual([...DOCS].sort());
      for (const p of fileParts) {
        expect(path.isAbsolute(String(p['path'])), String(p['path'])).toBe(true);
        expect(String(p['name']), 'a [File #N] label').toMatch(/^\[File #\d+\]$/u);
      }
      expect(parts[0], 'his words first').toEqual({ kind: 'text', text: 'ajouter les fichiers ' });
      expect(parts.filter((p) => p['kind'] === 'image'), 'the image part').toHaveLength(1);
      // the chips' numbers follow their places (one sequence with the image)
      const nums = parts.filter((p) => p['kind'] !== 'text').map((p) => Number(String(p['name']).replace(/\D/gu, '')));
      expect(nums, 'numbered in their order').toEqual([...nums].sort((a, b) => a - b));

      // his entry as the hub keeps it (a reload draws the same): deck.pptx gone at send time
      const kept = parts.map((p) => (p['kind'] === 'file' && String(p['path']).endsWith('deck.pptx') ? { ...p, missing: true } : p));
      // its text as bise_proto::parts::render writes it (the model's text, never drawn)
      const text = kept
        .map((p) =>
          p['kind'] === 'text'
            ? String(p['text'])
            : p['kind'] === 'image'
              ? `<image name="${String(p['name'])}" path="${String(p['source'])}" mime="image/png" b64="">`
              : `<file name="${String(p['name'])}" path="${String(p['path'])}"${p['missing'] === true ? ' missing="true"' : ''}>`,
        )
        .join('');
      await core.send({ ev: 'entry', project: HOME, agent: 'main', entry: { pos: 2, at_ms: Date.now(), kind: 'you', text, parts: kept } } as never);
      await expect(page.locator('[data-testid^="thread.pending."]'), "the echo with file markers ends 'sending…'").toHaveCount(0, { timeout: 3000 });
      const bubble = page.locator('[data-testid="thread.you.2.parts"]');
      await expect(bubble, 'his bubble draws the parts').toBeVisible({ timeout: 5000 });
      const chips = bubble.locator('[data-kind="file"]');
      await expect(chips).toHaveCount(DOCS.length);
      const gone = chips.filter({ hasText: 'deck.pptx' });
      await expect(gone, "the gone one says '· missing'").toContainText('· missing');
      const tone = await gone.locator('.th-attach-missing').evaluate((el) => {
        const probe = document.createElement('i');
        probe.style.color = 'var(--c-err)';
        document.body.append(probe);
        const err = getComputedStyle(probe).color;
        probe.remove();
        return { missing: getComputedStyle(el).color, err, chip: getComputedStyle(el.closest('.b-chip') ?? el).color };
      });
      expect(tone.missing, "'missing' in the err tone").toBe(tone.err);
      expect(tone.chip, 'the chip stays ink').not.toBe(tone.err);
      await shots(page, core, 'bubble');

      // a click previews, a right-click shows it in Finder, the gone one opens nothing
      const pdf = chips.filter({ hasText: 'q3.pdf' });
      await expect(pdf).toHaveAttribute('title', /preview · right-click: show in Finder/u);
      await pdf.click();
      expect(await out.wait('bise-desktop: quicklook', (r) => r.endsWith('q3.pdf'), 5000)).toBe(at('q3.pdf'));
      await pdf.click({ button: 'right' });
      expect(await out.wait('bise-desktop: reveal', (r) => r.endsWith('q3.pdf'), 5000)).toBe(at('q3.pdf'));
      const before = out.of('bise-desktop: quicklook').length;
      await gone.click();
      await page.waitForTimeout(300);
      expect(out.of('bise-desktop: quicklook').length, 'the gone file opens nothing').toBe(before);
      await expect(gone, 'its title says where it was').toHaveAttribute('title', /deck\.pptx is gone from /u);
      // the image chip previews too (main m_21751)
      await bubble.locator('[data-kind="image"]').first().click();
      await out.wait('bise-desktop: quicklook', (r) => r.endsWith('.png'), 5000);
    },
    { core: new FakeCore(world() as unknown as ConstructorParameters<typeof FakeCore>[0]), route: `agent/${HOME}/main`, size: '1100x760' },
  );
});

/** `<name>-light.png` and `<name>-dark.png`, the pointer off the chips; light again after */
async function shots(page: Page, core: FakeCore, name: string): Promise<void> {
  await page.mouse.move(1, 300);
  await page.screenshot({ path: test.info().outputPath(`${name}-light.png`) });
  await core.send(prefs('dark') as never);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath(`${name}-dark.png`) });
  await core.send(prefs('light') as never);
  await page.waitForTimeout(300);
}
