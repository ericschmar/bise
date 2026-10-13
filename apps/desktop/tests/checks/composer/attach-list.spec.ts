// composer/attach-list · the attachment list in the composer's box (his pick A, designer's
// composer-attachments; ambient-lead m_22590; numbering amb-feed m_22597). The REAL thread screen
// on the scripted core. Owner: amb-win. Passes when:
//   - a quote (a drag over main's answer, then a key) and a drop of an image, a document and a
//     second image make 4 rows in the box above his words, numbered by their chips' own n (1 2 3 4),
//     each 28 px, inside the box; nothing above 'to bise' (no strip line);
//   - the chips in the text say '❝ 1', the thumb slot and '2', '▯ 3';
//   - a hovered row lights its chip, a hovered chip lights its row; the key line says
//     'backspace on a chip removes it';
//   - ✕ on row 2 removes the row and its chip, the others keep their numbers (1 3 4); backspace
//     on the last chip removes it and its row; a click on a document's row is Quick Look;
//   - shots for designer: 1 and 4 attachments at 1100 and 800, a row hovered with its chip lit,
//     light and dark.
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { FakeCore, test, expect } from '../../harness';
import { dropFiles } from '../../harness/inputs';
import { onWorld } from '../native/world';

const HOME = 'bise-home-00000000';
const ROOT = mkdtempSync(path.join(tmpdir(), 'attach-list-'));
const LOGO = path.join(ROOT, 'logo.png');
const SHOT = path.join(ROOT, 'stripe.png');
const DECK = path.join(ROOT, 'deck.pptx');
copyFileSync(path.join(__dirname, '../fixtures/checker.png'), LOGO);
copyFileSync(path.join(__dirname, '../fixtures/checker.png'), SHOT);
writeFileSync(DECK, 'fake deck');
test.afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const ANSWER = "Contacte le service crédit immobilier, par le lien de contact sur cette même page d'aide.";
const prefs = (theme: string) => ({
  ev: 'prefs',
  prefs: { onboarded: true, theme, context: { shot: true, url: true, file: true, window_text: false }, excluded_apps: [], quiet: { call: true, share: true, fullscreen: true, focus: true, batch_min: 20, away_card: true }, voice: { fn_hold: true, fn_twice: 'spotlight', language: 'auto' }, shots_keep_days: 7 },
});
const world = () => [
  prefs('light'),
  { ev: 'projects', projects: [{ project: HOME, name: 'bise', path: ROOT, git: false, home: true, order: 0, agents: 1, working: 0, waits: 0, running: true }] },
  { ev: 'welcome', project: HOME, proto: 1, workspace: ROOT, name: 'bise' },
  { ev: 'agents', project: HOME, agents: [{ name: 'main', main: true, status: 'idle', archived: false, title: '', purpose: '', since_ms: 1791100000000, waits: 0 }] },
  {
    ev: 'thread',
    project: HOME,
    agent: 'main',
    entries: [
      { pos: 1, at_ms: 1791100001000, kind: 'you', text: 'qui gère le prêt ?' },
      { pos: 2, at_ms: 1791100002000, kind: 'agent', text: ANSWER },
    ],
    before: null,
    more: false,
  },
];

/** A drag over main's answer, then a key: its quote chip, then the words. */
async function quoteAnswer(page: Page): Promise<void> {
  const answer = page.getByTestId('thread.entry.2').locator('.th-md').first();
  await expect(answer, "main's answer").toContainText('crédit immobilier', { timeout: 10_000 });
  const b = await answer.boundingBox();
  if (!b) throw new Error('no answer box');
  await page.mouse.move(b.x + 4, b.y + 6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.type('Rédige un message pour ');
  await expect(page.locator('[data-testid="composer.chip.1"]'), 'the quote chip').toHaveText('❝ 1', { timeout: 5000 });
}

const rows = (page: Page) => page.locator('[data-testid^="composer.attach."][role="listitem"]');

async function shot(page: Page, core: FakeCore, name: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: test.info().outputPath(`${name}-light.png`) });
  await core.send(prefs('dark') as never);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath(`${name}-dark.png`) });
  await core.send(prefs('light') as never);
  await page.waitForTimeout(200);
}

for (const size of ['1100x720', '800x720']) {
  const w = size.split('x')[0] ?? '';
  test(`composer/attach-list: numbered rows in the box, linked to their chips, ✕ and backspace remove both (${w})`, async () => {
    const core = new FakeCore(world() as unknown as ConstructorParameters<typeof FakeCore>[0]);
    await onWorld(
      async ({ s, out }) => {
        const { page } = s;
        // the main window at this size (the widest window; as app/window-fit does)
        const [ww = 0, hh = 0] = size.split('x').map(Number);
        await s.app.evaluate(({ BrowserWindow }, [cw, ch]) => {
          const win = BrowserWindow.getAllWindows().sort((a, b) => (b.getSize()[0] ?? 0) - (a.getSize()[0] ?? 0))[0];
          win?.setContentSize(cw, ch);
        }, [ww, hh] as const);
        await expect.poll(() => page.evaluate(() => window.innerWidth), { message: `the window is ${size}` }).toBe(ww);
        const field = page.getByTestId('composer.field');
        await expect(field, "bise main's composer").toBeVisible({ timeout: 10_000 });
        await quoteAnswer(page);
        await expect(rows(page), 'one row').toHaveCount(1);
        await expect(page.getByTestId('composer.attach.1')).toContainText('“Contacte le service crédit immobilier');
        await expect(page.getByTestId('composer.attach.1')).toContainText('bise · 1 line');
        await shot(page, core, `one-${w}`);

        await field.click();
        await page.keyboard.press('End');
        await page.keyboard.type('avec le logo ');
        await dropFiles(page, '[data-testid="composer.field"]', [LOGO, DECK, SHOT]);
        await expect(rows(page), 'four rows, in the order added').toHaveCount(4, { timeout: 5000 });
        const ns = await rows(page).evaluateAll((els) => els.map((e) => e.querySelector('.n')?.textContent));
        expect(ns, "each row says its chip's number").toEqual(['1', '2', '3', '4']);
        await expect(page.locator('[data-testid="composer.chip.3"]'), "the document's chip says ▯ and its number").toHaveText('▯3');
        await expect(page.getByTestId('composer.attach.3')).toContainText('deck.pptx');
        await expect(page.getByTestId('composer.attach.2').locator('.in3'), "an image row's facts: its pixels and size").toHaveText(/^\d+×\d+ · \d+ (B|kB)$/u);
        await expect(page.locator('[data-testid^="composer.strip."]'), "no strip line above 'to bise'").toHaveCount(0);
        await expect(page.getByTestId('composer.tip')).toHaveText('backspace on a chip removes it');

        // inside the box, 28 px each, above his words
        const geo = await page.evaluate(() => {
          const box = document.querySelector('[data-testid="composer.box"]')?.getBoundingClientRect();
          const list = document.querySelector('[data-testid="composer.attach"]')?.getBoundingClientRect();
          const text = document.querySelector('[data-testid="composer.field"]')?.getBoundingClientRect();
          const hs = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="composer.attach."][role="listitem"]'), (e) => Math.round(e.getBoundingClientRect().height));
          return { inside: !!box && !!list && list.top >= box.top && list.bottom <= box.bottom, above: !!list && !!text && list.bottom <= text.top + 1, hs };
        });
        expect(geo, 'the list in the box, above the words, 28 px rows').toEqual({ inside: true, above: true, hs: [28, 28, 28, 28] });

        // a row lights its chip, a chip its row (a real mouse move first: CDP's drop leaves no pointer)
        await page.mouse.move(4, 4);
        await page.getByTestId('composer.attach.2').hover();
        await expect(page.locator('[data-testid="composer.chip.2"]'), 'row 2 lights chip 2').toHaveClass(/\blit\b/u);
        await shot(page, core, `four-hover-${w}`);
        await page.locator('[data-testid="composer.chip.1"]').hover();
        await expect(page.getByTestId('composer.attach.1'), 'chip 1 lights row 1').toHaveClass(/\blit\b/u);
        if (w !== '1100') return;

        // a click on the document's row is Quick Look
        await page.getByTestId('composer.attach.3').locator('.nm').click();
        expect(await out.wait('bise-desktop: quicklook', (r) => r.endsWith('deck.pptx'), 5000)).toBe(DECK);
        // ✕ on row 2: its row and its chip go, the others keep their numbers
        await page.getByTestId('composer.attach.2').hover();
        await page.getByTestId('composer.attach.2.remove').click();
        await expect(page.locator('[data-testid="composer.chip.2"]'), 'chip 2 is gone').toHaveCount(0);
        expect(await rows(page).evaluateAll((els) => els.map((e) => e.querySelector('.n')?.textContent)), 'never renumbered').toEqual(['1', '3', '4']);
        // backspace on the last chip (the caret right after it) removes it and its row
        await field.click();
        await page.keyboard.press('Meta+ArrowDown');
        // the drop leaves one space after the last chip: one step back puts the caret right after it
        if (await field.evaluate((el) => /\s$/u.test(el.textContent))) await page.keyboard.press('ArrowLeft');
        await page.mouse.move(4, 4); // a hovered chip would light its own row first

        await expect(page.getByTestId('composer.attach.4'), 'the caret after chip 4 lights its row').toHaveClass(/\blit\b/u);
        await page.keyboard.press('Backspace');
        await expect(page.locator('[data-testid="composer.chip.4"]')).toHaveCount(0);
        await expect(rows(page)).toHaveCount(2);
      },
      { core, route: `agent/${HOME}/main` },
    );
  });
}
