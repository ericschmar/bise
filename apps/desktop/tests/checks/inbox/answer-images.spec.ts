// inbox/answer-images · R41 (ambient-lead m_13889; msg-parts m_18030, main 18a32ce3): he answers a card
// with an image. Passes when, on the scripted core (FakeCore, fake data, a fixture PNG):
//   - the block's answer (one inbox, designer m_19631: the ⌘I screen and its own answer field are
//     gone): a PNG pasted in the composer while a card is open goes with his words as answer
//     {parts: [..., {kind:'image', source: its path}]}, no files (amb-win, main 18a32ce3). The
//     composer's chip look is thread/paste-image's.
// That the asking agent's request carries the image block is the hub's (amb-feed's laws) and
// qa-native's R41 (4)(5) on FAKE_BODIES. Owner: amb-home.
//   - a non-image file dropped there (file-chips, main 7a0ad800; ambient-lead m_21977) is a file
//     chip in the composer and goes as {kind:'file', name:'[File #1]', path: <absolute>} beside his
//     words, no files; his answer as the hub keeps it draws the file chip in perf's thread.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FakeCore, launchDesktop, test, expect } from '../../harness';
import { dropFiles, pasteImage } from '../../harness/inputs';

const HOME = 'bise-home-00000000';
const P = 'acme-1a2b3c4d';
const PNG = path.join(__dirname, '../fixtures/checker.png');
const agent = (name: string) => ({ name, main: name === 'main', status: name === 'perf' ? 'waiting' : 'idle', archived: false, title: '', purpose: '', since_ms: 1791100000000, waits: name === 'perf' ? 1 : 0 });
const card = (id: number, question: string) => ({ id, project: P, kind: 'question', rank: 1, agent: 'perf', question, options: [{ n: 1, label: 'cold' }, { n: 2, label: 'warm' }], urgent: false, since_ms: 1791100310000 + id });
const projects = (cards: unknown[]) => ({
  ev: 'projects',
  projects: [
    { project: HOME, name: 'bise', path: '/nowhere', git: false, home: true, order: 0, agents: 1, working: 0, waits: 0, running: true },
    { project: P, name: 'acme', path: '/nowhere/acme', git: true, home: false, order: 1, agents: 2, working: 0, waits: cards.length, running: true, cards },
  ],
});
const world = () => [
  { ev: 'prefs', prefs: { onboarded: true, theme: 'light', context: { shot: true, url: true, file: true, window_text: false }, excluded_apps: [], quiet: { call: true, share: true, fullscreen: true, focus: true, batch_min: 20, away_card: true }, voice: { fn_hold: true, fn_twice: 'spotlight', language: 'auto' }, shots_keep_days: 7 } },
  projects([card(9, 'which bench?'), card(10, 'which page?')]),
  { ev: 'welcome', project: P, proto: 1, workspace: '/nowhere/acme', name: 'acme' },
  { ev: 'agents', project: P, agents: [agent('main'), agent('perf')] },
  { ev: 'thread', project: P, agent: 'main', entries: [{ pos: 1, at_ms: 1791100001000, kind: 'agent', text: 'hello' }], before: null, more: false },
];
type Cmd = { cmd?: string; card?: number; reply?: string; files?: string[]; parts?: { kind: string; source?: string; name?: string; text?: string }[] };
const answers = (core: FakeCore) => core.cmds().filter((c) => (c as Cmd).cmd === 'answer') as Cmd[];

test("inbox/answer-images: an image pasted on a card's answer (the block's, in the composer) goes with it as a typed image part", async () => {
  const core = new FakeCore(world() as unknown as ConstructorParameters<typeof FakeCore>[0]);
  const s = await launchDesktop({ core, route: `project/${P}` });
  const { page } = s;
  try {
    await test.step("the block's answer: a PNG pasted in the composer goes with his words", async () => {
      await expect(page.getByTestId('inbox.block.row.1')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('inbox.block.row.1').click();
      await expect(page.getByTestId('inbox.block.open.1')).toBeVisible({ timeout: 3000 });
      const composer = '[data-testid="composer.field"]';
      await pasteImage(page, composer, PNG);
      await expect(page.locator('[data-testid^="composer.chip."][data-kind="image"]'), 'the image chip in the answer').toHaveCount(1, { timeout: 5000 });
      await page.locator(composer).first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' warm, like this');
      await page.keyboard.press('Enter');
      await expect.poll(() => answers(core).length, { timeout: 3000 }).toBe(1);
      const a = answers(core)[0];
      // the first row: both rank 1, the older first (order.ts sortCards), so 9
      expect(a).toMatchObject({ card: 9 });
      expect(a?.reply ?? '').toContain('warm, like this');
      // the thread's composer sends its image as a typed part with its source (main 18a32ce3,
      // ambient-lead m_17999), never as files beside parts
      expect(a?.files, 'no files beside parts').toBeUndefined();
      const img = (a?.parts ?? []).filter((p) => p.kind === 'image');
      expect(img.length, 'the pasted image goes with the answer').toBe(1);
      expect(img[0]?.source ?? '', "the image's path in the test home's store").toMatch(/\/images\/[0-9a-f]+\.png$/);
    });
  } finally {
    await s.close().catch(() => undefined);
    core.dispose();
  }
});

test("inbox/answer-images: a file dropped on a card's answer is a file chip and goes as a file part, its chip in his bubble", async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'answer-files-'));
  const csv = path.join(root, 'bench.csv');
  writeFileSync(csv, 'run,ms\ncold,412\n');
  const perfThread = { ev: 'thread', project: P, agent: 'perf', entries: [{ pos: 1, at_ms: 1791100002000, kind: 'agent', text: 'which bench?' }], before: null, more: false };
  const core = new FakeCore([...world(), perfThread] as unknown as ConstructorParameters<typeof FakeCore>[0]);
  const s = await launchDesktop({ core, route: `agent/${P}/perf` });
  const { page } = s;
  try {
    await expect(page.getByTestId('inbox.block.row.1')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('inbox.block.row.1').click();
    await expect(page.getByTestId('inbox.block.open.1')).toBeVisible({ timeout: 3000 });
    const composer = '[data-testid="composer.field"]';
    await page.locator(composer).first().click();
    await page.keyboard.type('cold, see ');
    await dropFiles(page, composer, [csv]);
    const chip = page.locator('[data-testid^="composer.chip."][data-kind="file"]');
    await expect(chip, 'a file chip, as the composer makes one').toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('[data-testid^="composer.attach."][data-kind="file"] .nm'), 'its row in the box names it').toHaveText('bench.csv');
    await page.keyboard.press('Enter');
    await expect.poll(() => answers(core).length, { timeout: 3000 }).toBe(1);
    const a = answers(core)[0] as Cmd & { parts?: { kind: string; name?: string; path?: string; text?: string }[] };
    expect(a).toMatchObject({ card: 9 });
    expect(a.files, 'no files beside parts').toBeUndefined();
    const parts = a.parts ?? [];
    expect(parts[0], 'his words first').toEqual({ kind: 'text', text: 'cold, see ' });
    expect(parts.filter((p) => p.kind === 'file'), 'the file part where its chip was').toEqual([{ kind: 'file', name: '[File #1]', path: csv }]);
    expect(a.reply ?? '', 'his words in the reply').toContain('cold, see');
    // his answer as the hub keeps it: the file chip in his bubble (amb-win's AttachChip)
    const text = `cold, see <file name="[File #1]" path="${csv}">`;
    await core.send({ ev: 'entry', project: P, agent: 'perf', entry: { pos: 2, at_ms: Date.now(), kind: 'you', text, parts } } as never);
    const bubble = page.getByTestId('thread.you.2.parts');
    await expect(bubble, 'his bubble draws the parts').toBeVisible({ timeout: 5000 });
    await expect(bubble.locator('[data-kind="file"]'), 'the file chip in his bubble').toHaveCount(1);
    await expect(bubble.locator('[data-kind="file"]')).toContainText('bench.csv');
  } finally {
    await s.close().catch(() => undefined);
    core.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
