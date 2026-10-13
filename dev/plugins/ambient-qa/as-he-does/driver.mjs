// The as-he-does run's window reader (ambient-lead m_18718, m_18946): the promoted app on the
// real-shaped world, read over CDP on 127.0.0.1 only, page events only. Never a native panel:
// settings.add.choose (the folder picker) is never touched.
//   node driver.mjs <cdp port> <out dir> <first|second|draft-type|draft-check> [<draft text>]
// first: the open frame, the banner, settings › projects, the add sheet's scan and one add, a
// message to a project's main and its answer. second: the open frame and the banner.
// draft-type: harness' composer gets <draft text>, never sent (ambient-lead m_19525); draft-check,
// after the restart: the same composer holds it again. Each writes <out>/<mode>[-<tag>].json.
// Writes <out>/<mode>.json ({steps: [{name, ok, info}], shots}) and <out>/<mode>-N-*.png.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = process.env.PW_FROM ?? path.join(HERE, '..', '..', '..', '..', 'apps', 'desktop');
const { chromium } = createRequire(path.join(DESKTOP, 'package.json'))('@playwright/test');
const [port, out, mode, draft] = process.argv.slice(2);
const tag = process.env.AS_HE_DOES_TAG ? `-${process.env.AS_HE_DOES_TAG}` : '';
const WATCHDOG_MS = Number(process.env.AS_HE_DOES_WATCHDOG_MS ?? 600000);
const ANSWER_MS = Number(process.env.AS_HE_DOES_ANSWER_MS ?? 240000);
const MESSAGE = 'hello from the as-he-does proof';

const res = { mode, steps: [], shots: [] };
const save = () => fs.writeFileSync(path.join(out, `${mode}${tag}.json`), JSON.stringify(res, null, 1));
const step = (name, ok, info) => { res.steps.push({ name, ok, info: info ?? null }); save(); };
setTimeout(() => { step('driver watchdog', false, `${WATCHDOG_MS / 1000} s`); process.exit(2); }, WATCHDOG_MS).unref();

// the app's CDP port answers some seconds after the open (c28260a9's first run: 3 drives refused at
// once, ECONNREFUSED): retried for up to 90 s, then a failed step, never an uncaught error
let browser;
for (const t0 = Date.now(); !browser;) {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 }).catch((e) => {
    if (Date.now() - t0 > 90000) { step('connect to the app (CDP)', false, String(e).slice(0, 300)); process.exit(1); }
    return null;
  });
  if (!browser) await new Promise((r) => setTimeout(r, 1000));
}
let page;
for (let i = 0; i < 100 && !page; i++) {
  for (const c of browser.contexts()) for (const p of c.pages()) {
    if (await p.locator('[data-testid="app.root"]').count().catch(() => 0)) page = p;
  }
  if (!page) await new Promise((r) => setTimeout(r, 200));
}
res.pages = browser.contexts().flatMap((c) => c.pages().map((p) => p.url()));
if (!page) { step('the window page', false, res.pages); process.exit(1); }

page.on('close', () => closed());
let n = 0;
const shot = async (name) => {
  const f = path.join(out, `${mode}${tag}-${++n}-${name}.png`);
  try { await page.screenshot({ path: f, timeout: 15000 }); }
  catch {
    try {
      const cdp = await page.context().newCDPSession(page);
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    } catch (e) { step(`frame ${name}`, false, String(e).slice(0, 200)); return; }
  }
  res.shots.push(f); save();
};
const text = (sel) => page.locator(sel).first().innerText({ timeout: 3000 }).catch(() => null);
const click = async (name, loc) => {
  try { await loc.click({ timeout: 8000 }); return true; }
  catch (e) { step(name, false, String(e).slice(0, 240)); return false; }
};
// the window can go away under a pass (7e691aef's rerun: the candidate quit at 07:48:09, rows2 then
// crashed in page.waitForTimeout): say it as a red step and end the pass, never an uncaught error
let ending = false;
const closed = () => {
  if (ending) return;
  step('the window stayed open through the pass', false, 'the page closed');
  process.exit(3);
};
const until = async (fn, ms, every = 1000) => {
  const t0 = Date.now();
  for (;;) {
    if (page.isClosed()) closed();
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, every));
  }
};

await page.locator('[data-testid="app.sidebar"]').first().waitFor({ timeout: 20000 }).catch(() => {});
// the status pill (e41cd3c2): 'starting bise…' and the core's words sit IN the title bar, no row
// under it, nothing below moves when it shows or goes. 5 s of samples from the window's first draw.
{
  const seen = { samples: 0, pill: 0, outside: 0, words: [], mainTops: [] };
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const p = r('[data-testid="app.core"]');
      const bar = r('[data-testid="app.title.panel"]') ?? r('[data-testid="app.title.sidebar"]');
      const m = r('[data-testid="app.main"]');
      return { p: p && p.width > 0 ? { top: p.top, bottom: p.bottom } : null, barBottom: bar ? bar.bottom : null, mainTop: m ? Math.round(m.top) : null,
        words: document.querySelector('[data-testid="app.core"]')?.textContent?.trim().slice(0, 80) ?? null };
    }).catch(() => null);
    if (s) {
      seen.samples++;
      if (s.mainTop !== null && !seen.mainTops.includes(s.mainTop)) seen.mainTops.push(s.mainTop);
      if (s.p) {
        seen.pill++;
        if (s.words && !seen.words.includes(s.words)) seen.words.push(s.words);
        if (s.barBottom !== null && s.p.top > s.barBottom + 4) seen.outside++;
      }
    }
    if (i === 1) await shot('launch-pill');
    await new Promise((r) => setTimeout(r, 250));
  }
  step('the status pill sits in the title bar; nothing moves under it (5 s from first draw)', seen.outside === 0 && seen.mainTops.length <= 1, seen);
}
await shot('open');
const upd = await text('[data-testid="app.update.text"]');
step("no 'didn't start right' banner", !(upd ?? '').includes("didn't start right"), upd);
step('core line', true, await text('[data-testid="app.core"]'));
const side = await text('[data-testid="app.sidebar"]');
step('sidebar', !!side, side);

// the window's frame (amb-mac 9f7c2f72, ambient-lead m_21559): 1280x720 on first open, clamped to the
// work area minus 24 px a side, kept per display in userData/window-frame.json. An off-screen run
// sees only the off-screen display (windows.ts OFF_SCREEN, 1920x1200 far from his), so it never
// lands on his screen. The bounds come from the page (outer size) and the kept file.
const FRAMES = process.env.AS_HE_DOES_USERDATA ? path.join(process.env.AS_HE_DOES_USERDATA, 'window-frame.json') : null;
const winBox = () => page.evaluate(() => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight, aw: window.screen.availWidth, ah: window.screen.availHeight })).catch(() => null);
const keptFrames = () => { try { return JSON.parse(fs.readFileSync(FRAMES, 'utf8')); } catch { return null; } };
// resize from CDP: the browser's Browser.setWindowBounds when Electron answers it, else window.resizeTo
const resizeWin = async (width, height) => {
  const how = await (async () => {
    const b = await browser.newBrowserCDPSession().catch(() => null);
    if (!b) return null;
    const t = await page.context().newCDPSession(page).then((s) => s.send('Target.getTargetInfo')).catch(() => null);
    const w = await b.send('Browser.getWindowForTarget', t?.targetInfo?.targetId ? { targetId: t.targetInfo.targetId } : {}).catch(() => null);
    if (!w) return null;
    return b.send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { width, height } }).then(() => 'Browser.setWindowBounds', () => null);
  })();
  if (how) return how;
  await page.evaluate(([w, h]) => window.resizeTo(w, h), [width, height]).catch(() => {});
  return 'window.resizeTo';
};
if (mode === 'first') {
  const box = await winBox();
  const wantW = box && box.aw > 0 ? Math.min(1280, box.aw - 48) : 1280;
  const wantH = box && box.ah > 0 ? Math.min(720, box.ah - 48) : 720;
  await shot('window-1280');
  step('the first launch opens at 1280x720, clamped to the work area (a frame for designer)', !!box && Math.abs(box.w - wantW) <= 2 && Math.abs(box.h - wantH) <= 2, { box, want: { w: wantW, h: wantH } });
}
if (mode === 'draft-type' && !tag.endsWith('atonce')) {
  // resized now; the restart that follows must bring this frame back (checked in draft-check)
  const before = await winBox();
  const how = await resizeWin(1180, 760);
  const after = await until(async () => { const b = await winBox(); return b && b.w !== before?.w ? b : null; }, 4000, 300);
  await page.waitForTimeout(800); // windows.ts keeps it 300 ms after the resize settles
  const kept = keptFrames();
  if (after) fs.writeFileSync(path.join(out, 'win-resized.json'), JSON.stringify({ w: after.w, h: after.h }));
  await shot('resized-window');
  step('the window resizes from CDP and its frame is kept (window-frame.json)', !!after && !!kept, { how, before, after, kept });
}
if (mode === 'draft-check' && fs.existsSync(path.join(out, 'win-resized.json')) && !tag.endsWith('atonce')) {
  const want = JSON.parse(fs.readFileSync(path.join(out, 'win-resized.json'), 'utf8'));
  const box = await until(async () => { const b = await winBox(); return b && Math.abs(b.w - want.w) <= 2 && Math.abs(b.h - want.h) <= 2 ? b : null; }, 5000, 300);
  await shot('frame-back');
  step('after a resize and a restart, the window comes back at its kept frame', !!box, { want, now: box ?? (await winBox()), kept: keptFrames() });
}

if (mode === 'first') {
  // the sidebar's '+ add a project' opens amb-home's add sheet in place (amb-win a83184e3), as he
  // does; when it doesn't, settings › projects and its own 'add a project'
  const sheet = page.locator('[data-testid="settings.add"]').first();
  let opened = await click('add a project (sidebar)', page.locator('[data-testid="app.sidebar.add"]').first());
  let shown = opened && await sheet.waitFor({ timeout: 10000 }).then(() => true, () => false);
  if (!shown) {
    await click('open settings', page.locator('[data-testid="app.sidebar.settings"]').first());
    const root = page.locator('[data-testid="settings.root"]').first();
    await root.waitFor({ timeout: 8000 }).catch(() => {});
    await click('settings › projects', root.getByText('projects', { exact: true }).first());
    await page.locator('[data-testid="settings.projects"]').first().waitFor({ timeout: 8000 }).catch(() => {});
    await shot('settings-projects');
    opened = await click('add a project (settings)', page.locator('[data-testid="settings.project.add"]').first());
    shown = opened && await sheet.waitFor({ timeout: 10000 }).then(() => true, () => false);
  }
  step('the add sheet opens from the sidebar', shown, null);
  step('the add sheet opens', shown, await text('[data-testid="settings.add"]'));
  // the scan: its found list with a count (never the folder picker)
  const found = page.locator('[data-testid="settings.add.found"]').first();
  const ft = shown ? await until(async () => {
    const t = await found.innerText({ timeout: 1000 });
    return t && /\d/.test(t) && !/scanning|looking/i.test(t) ? t : null;
  }, 120000) : null;
  await shot('scan');
  step('the scan answers with its count', !!ft, (ft ?? (await text('[data-testid="settings.add"]')) ?? '').slice(0, 800));
  // designer's final sign (ambient-lead m_19035): the sheet open after the scan answered, light
  if (ft) {
    // back to the scheme the page had, said explicitly: emulateMedia(null) can leave it on the other one
    const was = await page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')).catch(() => null);
    await page.emulateMedia({ colorScheme: 'light' }).catch(() => {});
    await page.waitForTimeout(400);
    await shot('add-sheet-light');
    if (was !== 'light') await page.emulateMedia({ colorScheme: was ?? null }).catch(() => {});
  }
  // one found repo, then add. a found row is `settings.add.found.<path>` (the Group's row, its text does
  // nothing); its tick box is the role=checkbox `settings.add.found.<name>` inside it (AddSheet.tsx)
  const boxes = page.locator('[role="checkbox"][data-testid^="settings.add.found."]');
  const count = await boxes.count().catch(() => 0);
  let picked = null;
  let ticked = false;
  if (count > 0) {
    const box = boxes.first();
    picked = await box.getAttribute('data-testid').catch(() => null);
    await click('tick a found repo', box);
    ticked = (await until(async () => (await box.getAttribute('aria-checked').catch(() => null)) === 'true' || null, 5000, 250)) === true;
  }
  const go = page.locator('[data-testid="settings.add.go"]').first();
  const goOn = await until(async () => (await go.isEnabled({ timeout: 1000 }).catch(() => false)) || null, 5000, 250) === true;
  const say = async () => await text('[data-testid="settings.add.say"]');
  if (goOn) await click('add', go);
  const grew = goOn ? await until(async () => {
    const s = await text('[data-testid="app.sidebar"]');
    return s && s !== side ? s : null;
  }, 60000) : null;
  const why = grew ? null : await say();
  await shot('added');
  step("'add a project' adds one (the sidebar shows it) or says why", goOn ? !!grew || !!why : false,
    { found_rows: count, picked, ticked, go_enabled: goOn, sidebar_after: grew, said: why, sheet: await text('[data-testid="settings.add"]') });
  // the sheet must not stay over the window: an open sheet takes the clicks the message step needs
  const still = await page.locator('[data-testid="settings.add"]').first().isVisible().catch(() => false);
  if (still) {
    await click('cancel the add sheet', page.locator('[data-testid="settings.add.cancel"]').first());
    await page.locator('[data-testid="settings.add"]').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  // a message to a project's main, and its answer
  await click('open harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  const composer = page.locator('[data-testid="composer"] [contenteditable="true"], [data-testid="composer"] textarea').first();
  const typed = await click('the composer', composer);
  if (typed) {
    await page.keyboard.type(MESSAGE, { delay: 15 });
    await page.keyboard.press('Enter');
  }
  // the answer: a thread row (thread.entry.<pos>, rows.tsx) after his row with the message, whose
  // kind isn't 'you' and that has words (a tools or thinking row alone isn't an answer). Never the
  // text after the message in the page: his row's own '11:47 ✓✓' read as an answer in run 3
  const answer = typed ? await until(() => page.evaluate((msg) => {
    const rows = [...document.querySelectorAll('[data-testid^="thread.entry."]')];
    const mine = rows.findIndex((r) => r.getAttribute('data-kind') === 'you' && (r.textContent ?? '').includes(msg));
    if (mine < 0) return null;
    for (const r of rows.slice(mine + 1)) {
      const kind = r.getAttribute('data-kind') ?? '';
      const words = (r.textContent ?? '').trim();
      if (kind !== 'you' && kind !== 'tools' && kind !== 'thinking' && words.length > 0) return `${kind}: ${words.slice(0, 400)}`;
    }
    return null;
  }, MESSAGE), ANSWER_MS, 2000) : null;
  await shot('message');
  step("a message to a project's main gets its answer", !!answer, answer ?? (await text('[data-testid="app.main"]'))?.slice(-800));
}
// this cut's rows (ambient-lead m_20075), seeded by one message to harness' main (the fake provider
// runs its [[bash: …]] calls): a turn of several runs, an agent kept and one dropped, a local .html
// artifact. Then: the runs fold, /agents lists the kept one and not the dropped, /archived lists the
// dropped, the artifact's frame has its pixels, the sidebar resizes by drag (its width kept for the
// restart's check), ctrl+r from the thread starts dictation's line (no mic under the knob), esc ends it.
// an open artifact's 3-column view folds the left bar under 1200 px: close it before the next pass
const closeArtifact = async () => {
  const pg = page.locator('[data-testid="artifact.page"]').first();
  if (!(await pg.count().catch(() => 0))) return;
  await page.locator('[data-testid="artifact.close"]').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
  await pg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
};

if (mode === 'cut') {
  const composerOf = () => page.locator('[data-testid="composer"] [contenteditable="true"], [data-testid="composer"] textarea').first();
  const say = async (words) => {
    if (!(await click(`say ${words.slice(0, 30)}`, composerOf()))) return false;
    // b51422c0: a '/diff' left in the composer took the next message ('/diff[[bash: …'): start empty
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    const parts = words.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i) await page.keyboard.press('Shift+Enter');
      await page.keyboard.type(parts[i], { delay: 5 });
    }
    await page.keyboard.press('Enter');
    // a slash command with args (/diff) spends the first Enter on the slash menu: send it with a second
    if (words.startsWith('/')) {
      await page.waitForTimeout(400);
      const left = ((await composerOf().innerText().catch(() => '')) ?? '').trim();
      if (left.startsWith('/')) await page.keyboard.press('Enter');
    }
    return true;
  };
  await click('open harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  const html = "<html><body style='margin:0;background:#2e8b57'><h1 style='color:#fff;font:40px sans-serif'>proof html</h1></body></html>";
  const seed = [
    'set up the proof rows',
    '[[bash: echo one]]', '[[bash: echo two]]', '[[bash: echo three]]',
    "[[bash: sb spawn keeper --objective 'hold the proof']]",
    "[[bash: sb spawn gone --objective 'an old one']]",
    `[[bash: printf "%s" "${html.replaceAll('"', "'")}" > proof.html && sb artifact add proof.html --title proof-html]]`,
  ].join(' ');
  const seeded = await say(seed);
  const done = seeded ? await until(() => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="thread.entry."]')].some((r) => r.getAttribute('data-kind') === 'artifact') || null), ANSWER_MS, 2000) : null;
  await shot('seeded');
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="thread.entry."]')].map((r) => r.getAttribute('data-kind')));
  // 'gone' is dropped in a LATER turn, once it is idle (amb-home m_20141: a drop in the turn that
  // spawned it makes the hub ask a 'drop' card instead of archiving); a drop card that still comes
  // is answered yes, which also proves the card path (ambient-lead m_20143)
  const goneIdle = await until(async () => {
    const s = (await text('[data-testid="app.sidebar"]')) ?? '';
    const i = s.indexOf('gone');
    return i >= 0 && /idle|done/.test(s.slice(i, i + 40)) ? true : null;
  }, ANSWER_MS, 2000);
  // its idle state is only noted: a drop that archives anyway (or asks its card) is the proof
  await say('[[bash: sb drop gone]]');
  const card = page.locator('[data-testid^="dock.opt"]').filter({ hasText: /yes|drop/i }).first();
  const asked = await card.waitFor({ timeout: 20000 }).then(() => true, () => false);
  let answered = null;
  if (asked) {
    await shot('drop-card');
    answered = await click("answer the drop card 'yes'", card);
    await page.locator('[data-testid^="dock.opt"]').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  }
  const dropped = await until(async () => {
    const s = (await text('[data-testid="app.sidebar"]')) ?? '';
    return /\bgone\b/.test(s) ? null : true;
  }, 60000, 1000);
  step("'gone' dropped (a drop card answered yes when asked)", !!dropped, { idle_first: !!goneIdle, card: asked, answered });
  // a thought of its own message (the fake provider's [[think: …]]): opened, it must never draw its
  // signature (BENDSIG::…, c28260a9's window guard)
  await say('think it over [[think: weighing the proof rows]]');
  const thoughts = page.locator('[data-testid^="thread.entry."]').filter({ has: page.locator('[data-testid^="thread.think."]') });
  const nThoughts = (await until(async () => ((await thoughts.count()) > 0 ? await thoughts.count() : null), ANSWER_MS, 1000)) ?? 0;
  for (let i = 0; i < nThoughts; i++) {
    const t = thoughts.nth(i);
    await t.getByText(/thought for/).first().click({ timeout: 3000 }).catch(() => t.click({ timeout: 3000 }).catch(() => {}));
  }
  if (nThoughts) await page.waitForTimeout(800);
  const thoughtText = nThoughts ? await thoughts.evaluateAll((rs) => rs.map((r) => r.textContent ?? '').join(' --- ')) : '';
  const mainText = (await text('[data-testid="app.main"]')) ?? '';
  await shot('thought-open');
  // the TUI folds a thought too ('∴ thought for 0.0s ▸', words on open): the row is there and opens to its words
  step('a short thought: its row is there and opens to its words', nThoughts > 0 && /weighing the proof rows/.test(thoughtText), { thoughts: nThoughts, text: thoughtText.slice(0, 200) });
  step('no BENDSIG text in an opened thought', nThoughts > 0 && !/BENDSIG/.test(thoughtText) && !/BENDSIG/.test(mainText), { thoughts: nThoughts, text: thoughtText.slice(0, 300) });
  step('the seed ran (runs, agents, artifact)', !!done, { kinds });
  step('the runs fold (tools rows, not one row per call)', kinds.filter((k) => k === 'tools').length >= 1 && kinds.filter((k) => k === 'tools').length < 6, kinds);
  // /agents and /archived
  for (const [cmd, want, not] of [['/agents', 'keeper', 'gone'], ['/archived', 'gone', null]]) {
    await click('back to harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
    await say(cmd);
    const t = await until(async () => { const s = await text('[data-testid="app.main"]'); return s && s.includes(want) ? s : null; }, 20000, 1000);
    await shot(cmd.slice(1));
    const body = t ?? (await text('[data-testid="app.main"]')) ?? '';
    step(`${cmd} lists ${want}${not ? ` and not ${not}` : ''}`, !!t && (!not || !new RegExp(`\\b${not}\\b`).test(body)), body.slice(0, 500));
    await page.keyboard.press('Escape').catch(() => {});
  }
  // the local .html artifact's pixels, and what its frame loads (ambient-lead m_20609: for amb-web +
  // task-panel when it is blank): every request, response, failure and console line from here
  const net = [];
  const onReq = (r) => net.push({ ev: 'request', url: r.url().slice(0, 300), type: r.resourceType(), frame: r.frame()?.url().slice(0, 200) });
  const onRes = (r) => net.push({ ev: 'response', url: r.url().slice(0, 300), status: r.status(), type: r.headers()['content-type'] ?? '' });
  const onFail = (r) => net.push({ ev: 'failed', url: r.url().slice(0, 300), error: r.failure()?.errorText ?? '' });
  const onCon = (m) => net.push({ ev: 'console', type: m.type(), text: m.text().slice(0, 300), url: m.location()?.url?.slice(0, 200) });
  const onPerr = (e) => net.push({ ev: 'pageerror', text: String(e).slice(0, 300) });
  page.on('request', onReq); page.on('response', onRes); page.on('requestfailed', onFail); page.on('console', onCon); page.on('pageerror', onPerr);
  await click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first());
  const item = page.locator('[data-testid="artifacts.list"]').getByText('proof-html').first();
  const opened = await click('select proof-html', item);
  if (opened) await page.keyboard.press('Enter');
  const frame = page.locator('iframe').first();
  const fr = opened ? await frame.waitFor({ timeout: 15000 }).then(() => true, () => false) : false;
  let green = 0;
  if (fr) {
    await page.waitForTimeout(1500);
    const png = (await frame.screenshot({ timeout: 15000 }).catch(() => null))?.toString('base64');
    green = png ? await page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 46) < 12 && Math.abs(d[i + 1] - 139) < 12 && Math.abs(d[i + 2] - 87) < 12) n++;
      return n / (d.length / 4);
    }, png) : 0;
  }
  const frames = await page.evaluate(() => [...document.querySelectorAll('iframe, webview, object, embed')].map((f) => ({
    tag: f.tagName.toLowerCase(), src: f.getAttribute('src'), srcdoc: (f.getAttribute('srcdoc') ?? '').slice(0, 200), sandbox: f.getAttribute('sandbox'),
    w: f.clientWidth, h: f.clientHeight })));
  const docs = [];
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    docs.push({ url: f.url().slice(0, 300), body: (await f.evaluate(() => document.documentElement?.outerHTML?.slice(0, 300) ?? '').catch((e) => `unreadable: ${String(e).slice(0, 120)}`)) });
  }
  page.off('request', onReq); page.off('response', onRes); page.off('requestfailed', onFail); page.off('console', onCon); page.off('pageerror', onPerr);
  fs.writeFileSync(path.join(out, `${mode}-artifact-frame.json`), JSON.stringify({ frames, docs, net }, null, 1));
  await shot('artifact-html');
  step('a local .html artifact renders (its green pixels)', green > 0.3, { opened, frame: fr, green_share: Math.round(green * 100) / 100, frames, docs: docs.slice(0, 3), net_lines: net.length });
  // the sidebar resizes by drag; its width is kept for the restart's check. The open artifact folds
  // the left bar to a rail (no split, no 'harness' label): close it first (run 40fc444d's 2 reds)
  await closeArtifact();
  const split = page.locator('[data-testid="app.split.side"]').first();
  const w0 = Number(await split.getAttribute('aria-valuenow').catch(() => null));
  const box = await split.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  const w1 = Number(await split.getAttribute('aria-valuenow').catch(() => null));
  fs.writeFileSync(path.join(out, 'side-width.txt'), String(w1));
  await shot('resized');
  step('the sidebar resizes by drag', !!box && w1 > w0, { before: w0, after: w1 });
  // ctrl+r from the thread (not the field): dictation's line shows, esc ends it
  await click('back to harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
  const before = (await text('[data-testid="composer"]')) ?? '';
  await page.keyboard.press('Control+r');
  const line = await until(async () => { const t = (await text('[data-testid="composer"]')) ?? ''; return t !== before && /dictat|listen|mic|speak|voice/i.test(t) ? t : null; }, 8000, 500);
  await shot('ctrl-r');
  await page.keyboard.press('Escape');
  const after = (await text('[data-testid="composer"]')) ?? '';
  step('ctrl+r from the thread starts dictation; esc ends it', !!line && !/listening/i.test(after), { line: line?.slice(0, 300), after_esc: after.slice(0, 200) });
  // every message of this mode was sent (seed, drop, /agents, /archived): none stays 'sending…'
  // (c28260a9's sending-after-page-echo fix)
  const stuck = await until(async () => { const t = (await text('[data-testid="app.main"]')) ?? ''; return /sending…|sending\.\.\./.test(t) ? null : true; }, 20000, 1000);
  await shot('no-sending');
  step("no message stays 'sending…'", !!stuck, stuck ? null : ((await text('[data-testid="app.main"]')) ?? '').match(/.{0,120}sending.{0,40}/s)?.[0]);
  await closeArtifact();
}

// the first cut from main (ambient-lead m_20586): the right bar, an artifact opened from it, back /
// forward, the working row, the inbox block with another project's item, a short thought's words
if (mode === 'rows2') {
  const composerOf = () => page.locator('[data-testid="composer"] [contenteditable="true"], [data-testid="composer"] textarea').first();
  const say = async (words) => {
    if (!(await click(`say ${words.slice(0, 30)}`, composerOf()))) return false;
    // b51422c0: a '/diff' left in the composer took the next message ('/diff[[bash: …'): start empty
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    const parts = words.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i) await page.keyboard.press('Shift+Enter');
      await page.keyboard.type(parts[i], { delay: 5 });
    }
    await page.keyboard.press('Enter');
    // a slash command with args (/diff) spends the first Enter on the slash menu: send it with a second
    if (words.startsWith('/')) {
      await page.waitForTimeout(400);
      const left = ((await composerOf().innerText().catch(() => '')) ?? '').trim();
      if (left.startsWith('/')) await page.keyboard.press('Enter');
    }
    return true;
  };
  const harness = () => click('open harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  await closeArtifact();
  // one waiting item in another project: ai-docs' main opens a card for him (for bise's inbox block)
  await click('open ai-docs', page.locator('[data-testid="app.sidebar"]').getByText('ai-docs', { exact: true }).first());
  await say("[[bash: sb card 'publish the ai-docs guide now?\n1. publish\n2. later']]");
  const carded = await until(async () => (/done: tool bash ok/.test((await text('[data-testid="app.main"]')) ?? '') ? true : null), ANSWER_MS, 1000);
  step("ai-docs' main opened a card for him (the inbox item)", !!carded, ((await text('[data-testid="app.main"]')) ?? '').slice(-300));
  await harness();
  // (g)'s maker (ambient-lead m_21810): an agent with a long name and purpose makes an artifact from
  // its own brief ({{bash: …}}: the fake provider runs those when the message has no [[…]] marker),
  // dropped at the end of this pass. Its page has no quote in it (the brief is in double quotes).
  const MAKER = 'release-ts-pattern';
  const makerHtml = '<html><body style=margin:0;background:#2e8b57><h1>release notes</h1></body></html>';
  await say(`[[bash: sb spawn ${MAKER} --objective "Release ts-pattern on npm: the changelog, the tag, the GitHub release notes and the docs site {{bash: printf '%s' '${makerHtml}' > rel-ts.html && sb artifact add rel-ts.html --title rel-ts-notes}}"]]`);
  // the right bar: its four sections in order; the left bar holds places only
  const panel = page.locator('[data-testid="app.panel"]').first();
  const shown = await panel.waitFor({ timeout: 10000 }).then(() => true, () => false);
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="app.right."]')]
    .map((e) => e.getAttribute('data-testid')).filter((t) => /^app\.right\.(agents|archived|artifacts|scheduled)$/.test(t)));
  await shot('right-bar');
  step('the right bar: agents, archived, artifacts, scheduled', shown && order.join(',') === 'app.right.agents,app.right.archived,app.right.artifacts,app.right.scheduled', order);
  const agentsText = (await text('[data-testid="app.right.agents"]')) ?? '';
  step('the right bar lists the agents (keeper; main is the thread itself)', /\bkeeper\b/.test(agentsText) && !/\bgone\b/.test(agentsText), agentsText.slice(0, 300));
  const leftAgents = await page.locator('[data-testid="app.sidebar"] [data-testid*=".agent."]').count().catch(() => 0);
  step('the left bar holds places only (no agent rows)', leftAgents === 0 && !/\bkeeper\b/.test((await text('[data-testid="app.sidebar"]')) ?? ''), { agent_rows: leftAgents });
  // ⌥⌘0 and the title bar's toggle hide and bring back the right bar
  await page.keyboard.press('Alt+Meta+0');
  const hid = await until(async () => ((await panel.count()) === 0 || !(await panel.isVisible().catch(() => false)) ? true : null), 5000, 300);
  await shot('right-bar-hidden');
  await page.keyboard.press('Alt+Meta+0');
  const back = await panel.waitFor({ timeout: 5000 }).then(() => true, () => false);
  step('⌥⌘0 hides and brings back the right bar', !!hid && back, { hid: !!hid, back });
  const tog = page.locator('[data-testid="app.title.panel"]').first();
  let togOk = false;
  if (await click('the title bar toggle', tog)) {
    const h2 = await until(async () => ((await panel.count()) === 0 || !(await panel.isVisible().catch(() => false)) ? true : null), 5000, 300);
    await click('the title bar toggle again', tog);
    togOk = !!h2 && await panel.waitFor({ timeout: 5000 }).then(() => true, () => false);
  }
  step("the title bar's toggle hides and brings back the right bar", togOk, null);
  // an artifact from the right bar: the 3-column view, its page drawn in the frame; ✕ and esc back
  const row = page.locator('[data-testid="app.right.artifacts"] [data-testid*="proof-html"], [data-testid="app.right.artifacts"] button, [data-testid="app.right.artifacts"] [role="button"]').filter({ hasText: 'proof-html' }).first();
  const opened = await click('proof-html from the right bar', row);
  const pageEl = page.locator('[data-testid="artifact.page"]').first();
  const drawn = opened && await pageEl.waitFor({ timeout: 15000 }).then(() => true, () => false);
  let green = 0;
  if (drawn) {
    await page.waitForTimeout(1500);
    const png = (await pageEl.screenshot({ timeout: 15000 }).catch(() => null))?.toString('base64');
    green = png ? await page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 46) < 12 && Math.abs(d[i + 1] - 139) < 12 && Math.abs(d[i + 2] - 87) < 12) n++;
      return n / (d.length / 4);
    }, png) : 0;
  }
  const cols = await page.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    // the left bar: shown, and left of the thread (1c5659b8 run: the dragged sidebar is ~240 px, a
    // fixed 160 px rail check read it as missing)
    const side = document.querySelector('[data-testid="app.sidebar"]')?.getBoundingClientRect();
    const main = document.querySelector('[data-testid="app.main"]')?.getBoundingClientRect();
    const rail = !!side && side.width > 0 && side.left < 20 && (!main || side.right <= main.left + 2);
    return { rail, rail_w: side ? Math.round(side.width) : null, thread: vis('[data-testid="app.main"]'), page: vis('[data-testid="artifact.page"]') };
  });
  await shot('artifact-from-right-bar');
  step('an artifact from the right bar: 3 columns, its page drawn (green pixels)', drawn && green > 0.3 && cols.rail && cols.thread && cols.page, { opened, drawn, green: Math.round(green * 100) / 100, cols });
  const closed = await click('✕', page.locator('[data-testid="artifact.close"]').first());
  const gone1 = closed && await pageEl.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
  await click('proof-html again', row);
  await pageEl.waitFor({ timeout: 10000 }).catch(() => {});
  await page.keyboard.press('Escape');
  const gone2 = await pageEl.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
  step('✕ and esc close the artifact', gone1 && gone2, { x: gone1, esc: gone2 });
  // e5759db9 (his ask, main m_21531), as app/artifact-view.spec checks it: words in harness' main
  // composer, then the artifact open and words in the composer beside it ('about' the page). One esc
  // closes the artifact: main's words and label as he left them; back on the artifact, its words and
  // label too. A second esc does today's thing (a composer with words keeps it: no move, nothing reopens).
  const MAIN_WORDS = 'half a thought for main';
  const ART_WORDS = 'and the green, is it on brand?';
  const field = page.locator('[data-testid="composer.field"]:visible').first();
  // the label without the working mark's gust (its glyphs change each frame while main works)
  const lbl = () => page.locator('.b-composer .lbl:visible').first().innerText({ timeout: 1000 })
    .then((s) => s.replace(/[∿≈~∼∽·]+/g, ' ').replace(/\s+/g, ' ').trim(), () => null);
  const fieldText = async () => ((await field.innerText({ timeout: 1000 }).catch(() => '')) ?? '').trim();
  const typeIn = async (words) => {
    if (!(await click('the composer', field))) return false;
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(words, { delay: 5 });
    return true;
  };
  await harness();
  const mainTyped = await typeIn(MAIN_WORDS);
  const mainLabel = await lbl();
  await click('proof-html for the esc row', row);
  const reopened = await pageEl.waitFor({ timeout: 10000 }).then(() => true, () => false);
  let escRow = { main_typed: mainTyped, reopened };
  if (mainTyped && reopened && await typeIn(ART_WORDS)) {
    const artLabel = await lbl();
    await page.keyboard.press('Escape');
    const closed1 = await pageEl.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
    await page.waitForTimeout(300);
    const back = { words: await fieldText(), label: await lbl() };
    await shot('esc-artifact-main-kept');
    await click('proof-html again', row);
    const again = await pageEl.waitFor({ timeout: 10000 }).then(() => true, () => false);
    const onArt = again ? await until(async () => ((await fieldText()) === ART_WORDS ? { words: ART_WORDS, label: await lbl() } : null), 5000, 300) : null;
    await shot('esc-artifact-words-back');
    escRow = { closed: closed1, main: { before: { words: MAIN_WORDS, label: mainLabel }, after: back }, artifact: { before: { words: ART_WORDS, label: artLabel }, after: onArt ?? { words: await fieldText(), label: await lbl() } }, answering: /answering/.test(artLabel ?? '') ? 'proven' : 'no docked card in harness: the labels kept are to main / about the page' };
    step("esc with an artifact open closes it first; his words and the composer's mode stay (main's, and the artifact's on reopen)",
      closed1 && back.words === MAIN_WORDS && back.label === mainLabel && !!onArt && onArt.label === artLabel, escRow);
    // close it again (esc from the artifact's composer), then a second esc on harness' main with words
    await click('the composer beside the artifact', field);
    await page.keyboard.press('Escape');
    await pageEl.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await click('the composer', field);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const second = {
      artifact_reopened: (await pageEl.count()) > 0,
      went_up_to_bise: (await page.locator('[data-testid="app.sidebar.bise"][aria-current]').count()) > 0,
      words: await fieldText(),
      label: await lbl(),
    };
    await shot('esc-artifact-second-esc');
    step("a second esc does today's thing (a composer with words keeps it: no move, nothing reopens)", !second.artifact_reopened && !second.went_up_to_bise, second);
  } else step("esc with an artifact open closes it first; his words and the composer's mode stay (main's, and the artifact's on reopen)", false, escRow);
  // both composers emptied, so the next rows start clean
  await closeArtifact();
  await harness();
  if (await click('the composer', field)) { await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); }
  await click('proof-html to empty its composer', row);
  if (await pageEl.waitFor({ timeout: 10000 }).then(() => true, () => false) && await click('the composer beside the artifact', field)) {
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
  }
  await closeArtifact();
  // back / forward: harness -> artifacts -> ⌘[ harness -> ⌘] artifacts; esc from harness' main goes up to bise
  await harness();
  await click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first());
  await page.locator('[data-testid="artifacts.list"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.keyboard.press('Meta+BracketLeft');
  const wentBack = await until(async () => ((await page.locator('[data-testid="artifacts.list"]').count()) === 0 && /harness/.test((await text('[data-testid="app.main"]')) ?? '') ? true : null), 5000, 300);
  await page.keyboard.press('Meta+BracketRight');
  const wentFwd = await page.locator('[data-testid="artifacts.list"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  step('⌘[ goes back, ⌘] forward', !!wentBack && wentFwd, { back: !!wentBack, forward: wentFwd });
  await harness();
  await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
  await page.keyboard.press('Escape');
  const upToBise = await until(async () => (/every project|to bise\s*$/m.test((await text('[data-testid="app.main"]')) ?? '') || (await page.locator('[data-testid="app.sidebar.bise"][aria-current]').count()) > 0 ? true : null), 5000, 300);
  await shot('esc-up');
  step("esc from a project's main goes up to bise", !!upToBise, ((await text('[data-testid="app.main"]')) ?? '').slice(0, 200));
  // the working row while an agent works (a slow turn), then a short thought with its words
  // 96750f52 (ambient-lead m_21810 (b)): the working mark, the TUI's gust after 'to main' on the
  // composer's label line; no 'is working' row in the thread (thread.live / thread.waiting are gone),
  // and nothing in the thread moves with the gust's frames (sampled every 110 ms, its frame step)
  await harness();
  await say('take a moment [[slow: 12]]');
  const mark = page.locator('[data-testid="thread.mark"][data-state="working"]').first();
  const marked = await mark.waitFor({ timeout: 10000 }).then(() => true, () => false);
  const wk = { mark: marked };
  if (marked) {
    wk.label = await lbl();
    const geo = () => page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round).join(','); };
      const sc = document.querySelector('[data-testid="thread.list"] [data-virtuoso-scroller]') ?? document.querySelector('[data-testid="thread.list"]');
      return { list: r('[data-testid="thread.list"]'), mark: r('[data-testid="thread.mark"]'), composer: r('[data-testid="composer"]'), scroll: sc ? `${Math.round(sc.scrollTop)},${sc.scrollHeight}` : null, gust: document.querySelector('[data-testid="thread.mark.gust"]')?.textContent ?? null };
    }).catch(() => null);
    // 96db3e08 run: one 18 px scrollTop move right after the send (the send's bottom settle, not
    // the gust?). Let the send settle 500 ms before sampling, so a move left is the gust's (ambient-lead m_22035)
    await page.waitForTimeout(500);
    const g = [];
    for (let i = 0; i < 16; i++) { g.push(await geo()); await page.waitForTimeout(110); }
    const same = (k) => new Set(g.map((x) => x?.[k] ?? null)).size === 1;
    wk.gust_frames = new Set(g.map((x) => x?.gust ?? null)).size;
    // the scroller may grow when a row lands (new content, kept at the bottom): that is not the gust
    // moving it. Red only when scrollTop moves while scrollHeight stays (the thread jumps by itself).
    const sc = g.map((x) => (x?.scroll ?? '').split(',').map(Number));
    const jumps = sc.slice(1).filter((s, i) => s[1] === sc[i][1] && s[0] !== sc[i][0]).length;
    wk.scrolls = [...new Set(g.map((x) => x?.scroll ?? null))];
    wk.still = { list: same('list'), scroll: jumps === 0, composer: same('composer'), mark_box: same('mark') };
    wk.scroll_jumps = jumps;
    wk.first = g[0];
    wk.old_rows = await page.locator('[data-testid="thread.live"], [data-testid="thread.waiting"]').count();
    wk.is_working_text = /is working/.test((await text('[data-testid="thread.list"]')) ?? '');
    const lb = await page.locator('.b-composer .lbl:visible').first().boundingBox().catch(() => null);
    const mb = await mark.boundingBox().catch(() => null);
    wk.on_label_line = !!lb && !!mb && Math.abs((lb.y + lb.height / 2) - (mb.y + mb.height / 2)) <= 6;
    await shot('working-mark');
    await mark.hover({ timeout: 2000 }).catch(() => {});
    wk.tip = await page.locator('[data-testid="thread.mark.tip"]').first().innerText({ timeout: 2000 }).catch(() => null);
    await shot('working-mark-tip');
    await page.mouse.move(1, 400);
  }
  // the home thread names its main 'bise' (ambient-lead m_22076): the label reads 'to bise'
  step("the working mark: a gust after 'to bise' while main works, no 'is working' row, the thread still under its frames",
    marked && /^to (bise|main)\b/.test((wk.label ?? '').trim()) && wk.on_label_line && wk.old_rows === 0 && !wk.is_working_text && wk.gust_frames >= 2 && Object.values(wk.still).every(Boolean), wk);
  await until(async () => (/ack: take a moment/.test((await text('[data-testid="app.main"]')) ?? '') ? true : null), ANSWER_MS, 1000);
  await say('one quick thought [[think: weighing the proof rows]]');
  // the TUI folds a thought too (ambient-lead m_20609): the row is there, then opens to its words
  const rows = page.locator('[data-testid^="thread.entry."]').filter({ has: page.locator('[data-testid^="thread.think."]') });
  const nRows = (await until(async () => ((await rows.count()) > 0 ? await rows.count() : null), ANSWER_MS, 1000)) ?? 0;
  const last = rows.nth(Math.max(0, nRows - 1));
  if (nRows) await last.getByText(/thought for/).first().click({ timeout: 3000 }).catch(() => last.click({ timeout: 3000 }).catch(() => {}));
  const words = nRows ? await until(async () => (/weighing the proof rows/.test((await last.textContent().catch(() => '')) ?? '') ? true : null), 5000, 300) : null;
  await shot('short-thought');
  step('a short thought: its row is there and opens to its words', !!words, { rows: nRows, text: nRows ? ((await last.textContent().catch(() => '')) ?? '').slice(0, 200) : '' });
  // the inbox block in bise's thread: another project's item answered there; ⌘I opens it in place
  await click('bise', page.locator('[data-testid="app.sidebar.bise"]').first());
  // a long reply in bise's own thread, so it scrolls for the block's height row (1c5659b8 run: the
  // thread was empty, nothing scrolled)
  const longMd = path.join(out, 'long-reply.md');
  fs.writeFileSync(longMd, Array.from({ length: 60 }, (_, i) => `scroll line ${i + 1}: a long reply so bise's thread scrolls.`).join('\n\n') + '\n');
  await say(`a long one please [[reply: ${longMd}]]`);
  const longIn = await until(async () => (/scroll line 60/.test((await text('[data-testid="thread.list"]')) ?? '') ? true : null), ANSWER_MS, 1000);
  step("a long reply in bise's thread (so it scrolls)", !!longIn, null);
  const block = page.locator('[data-testid^="inbox.block"]').first();
  const hasBlock = await block.waitFor({ timeout: 15000 }).then(() => true, () => false);
  const blockText = hasBlock ? ((await block.innerText().catch(() => '')) ?? '') : '';
  await shot('inbox-block');
  step("bise's thread shows the inbox block with another project's item", hasBlock && /shop|telemetry|docs|ai-docs|folder/.test(blockText), blockText.slice(0, 300));
  // f29e895c (designer m_21505): the block never folds or changes height when the thread scrolls
  const blockH = () => page.locator('[data-testid="inbox.block"]').first().boundingBox({ timeout: 2000 }).then((b) => (b ? Math.round(b.height) : null), () => null);
  const listTop = () => page.evaluate(() => {
    const list = document.querySelector('[data-testid="thread.list"]');
    const scrolls = (x) => x.scrollHeight > x.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(x).overflowY);
    let e = list && [list, ...list.querySelectorAll('*')].find(scrolls);
    if (!e) { e = list; while (e && !scrolls(e)) e = e.parentElement; }
    return e ? Math.round(e.scrollTop) : null;
  }).catch(() => null);
  if (hasBlock) {
    const h0 = await blockH();
    const top0 = await listTop();
    const lb = await page.locator('[data-testid="thread.list"]').first().boundingBox({ timeout: 3000 }).catch(() => null);
    if (lb) await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height * 0.7);
    const hs = [];
    const tops = [];
    // 8b00ed2b (ambient-lead m_21810 (c), as thread/steady-bottom.spec): the composer, its keys line
    // and the inbox block keep their boxes while the thread scrolls, moving and stopped
    const bottom = () => page.evaluate(() => {
      const at = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); };
      return { composer: at('.th-screen .b-composer') ?? at('[data-testid="composer"]'), keys: at('[data-testid="composer.keys"]'), block: at('[data-testid="inbox.block"]') };
    }).catch(() => null);
    const rest = await bottom();
    const moving = [];
    const stopped = [];
    for (const dy of [-200, -200, -200, -200, 200, 200, 800]) {
      await page.mouse.wheel(0, dy);
      moving.push(await bottom());
      await page.waitForTimeout(150);
      hs.push(await blockH());
      tops.push(await listTop());
      await page.waitForTimeout(250);
      stopped.push(await bottom());
    }
    await shot('inbox-block-scrolled');
    const moved = tops.some((t) => t !== null && t !== top0);
    step('the inbox block keeps its height on scroll', h0 !== null && moved && hs.every((x) => x !== null && Math.abs(x - h0) <= 1), { height: h0, during: hs, scroll_top: [top0, ...tops], thread_scrolled: moved });
    const key = (b) => JSON.stringify(b);
    const off = [...moving, ...stopped].map((b, i) => (key(b) === key(rest) ? null : { at: i < moving.length ? `moving ${i}` : `stopped ${i - moving.length}`, box: b })).filter(Boolean);
    step('steady bottom: wheel up and down on a long thread, the composer, keys line and inbox block boxes unchanged',
      !!rest && !!rest.composer && !!rest.keys && !!rest.block && moved && off.length === 0, { rest, thread_scrolled: moved, changed: off.slice(0, 6) });
  } else step('the inbox block keeps its height on scroll', false, 'no inbox block');
  // 82cd5263 + a6efc5cb (ambient-lead m_21810 (d), as app/cmd-hints.spec): ⌘ held alone 400 ms shows
  // the keys where they act: bise's '0', each project's digit in place of its count, ⌘[ under ‹ (a
  // place behind), ⌘] under › (one ahead), ⌘I on the inbox head; released, all gone. A quick ⌘: none.
  const hintsNow = () => page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
    const rows = [...document.querySelectorAll('[data-testid^="app.sidebar.project."]')].filter((r) => /^app\.sidebar\.project\.[^.]+$/.test(r.getAttribute('data-testid')));
    return {
      n: document.querySelectorAll('.app-keyhint').length,
      bise: t('[data-testid="app.sidebar.bise.hint"]'),
      projects: rows.map((r) => ({ name: (r.textContent ?? '').trim().slice(0, 24), hint: r.querySelector('.app-keyhint')?.textContent?.trim() ?? null, count: !!r.querySelector('.app-cnt') })),
      back: t('[data-testid="app.title.back.hint"]'), forward: t('[data-testid="app.title.forward.hint"]'), inbox: t('[data-testid="inbox.block.hint"]'),
    };
  }).catch(() => null);
  const holdCmd = async (name) => {
    await page.keyboard.down('Meta');
    await page.waitForTimeout(700);
    const held = await hintsNow();
    await shot(name);
    await page.keyboard.up('Meta');
    await page.waitForTimeout(300);
    return { held, released: await hintsNow() };
  };
  await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
  // e4394a9e: the hints show after 150 ms (the TUI's ctrl hint delay), so a quick ⌘ is 60 ms
  await page.keyboard.down('Meta');
  await page.waitForTimeout(60);
  const quick = await hintsNow();
  await page.keyboard.up('Meta');
  await page.waitForTimeout(400);
  const onBise = await holdCmd('cmd-held-bise');
  const ph = onBise.held?.projects ?? [];
  const digitsOk = ph.length > 0 && ph.slice(0, 9).every((p, i) => p.hint === String(i + 1) && !p.count);
  step('hold ⌘ 400 ms on bise: digits on bise and the projects, ⌘[ on the back arrow, ⌘I on the inbox head; all gone on release',
    !!onBise.held && quick?.n === 0 && onBise.held.bise === '0' && digitsOk && onBise.held.back === '⌘[' && onBise.held.inbox === '⌘I' && onBise.released?.n === 0,
    { quick_cmd_hints: quick?.n ?? null, ...onBise });
  // one place back (harness), so › has a place ahead: ⌘] under it; then ⌘] to bise again
  await page.keyboard.press('Meta+BracketLeft');
  await page.waitForTimeout(800);
  const behind = await holdCmd('cmd-held-forward');
  step('hold ⌘ after ⌘[: ⌘] on the forward arrow, gone on release', behind.held?.forward === '⌘]' && behind.released?.n === 0, behind);
  await page.keyboard.press('Meta+BracketRight');
  await page.waitForTimeout(800);
  if (!(await page.locator('[data-testid="app.sidebar.bise"][aria-current]').count())) await click('bise', page.locator('[data-testid="app.sidebar.bise"]').first());
  // ⌘I is the native menu's accelerator (src/main/menu.ts): CDP keys go to the page and never reach
  // the menu, so off-screen it can't be pressed. ⌃1 (the block's own key) opens the same item in place.
  await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
  await page.keyboard.press('Control+1');
  // the dock's options carry the composer's id (composer.opt.<n>, ds/composer.tsx); dock.opt before 6ac92eb4
  // b4a25acb: the item opens as the inbox card in the strip's dock, its options strip.card.<key>.opt.<n> (InboxCard.tsx)
  // b51422c0: in bise's thread the item opens in the inbox block itself (Block.tsx's InboxCard,
  // default id inbox.card.<project>-<id>, options inbox.card.<project>-<id>.opt.<n>)
  // b51422c0 run: Block.tsx passes testId inbox.block.card.<key> (inbox.block.notify for a notice),
  // so the options there are inbox.block.card.<key>.opt.<n>
  const OPT = '[data-testid^="strip.card"][data-testid*=".opt."], [data-testid^="inbox.card"][data-testid*=".opt."], [data-testid^="inbox.block.card"][data-testid*=".opt."], [data-testid^="inbox.block.notify.opt."], [data-testid^="composer.opt"], [data-testid^="dock.opt"]';
  const inPlace = await until(async () => ((await page.locator(OPT).count()) > 0 ? true : null), 8000, 400);
  await shot('inbox-ctrl-1');
  step('⌃1 opens the item in place (its options in the dock; ⌘I = native menu, not reachable by CDP)', !!inPlace, ((await text('[data-testid="app.main"]')) ?? '').slice(-300));
  if (inPlace) {
    const opt = page.locator(OPT).first();
    const label = await opt.innerText().catch(() => '');
    await click('answer it there', opt);
    const answered = await until(async () => ((await page.locator(OPT).count()) === 0 ? true : null), 15000, 500);
    await shot('inbox-answered');
    step("another project's item answered from bise's thread", !!answered, { option: label.slice(0, 80) });
  }
  // 1c5659b8 + the hub's 5b19b586 (main m_21514): his free words on another project's docked drafts
  // card, from bise's thread, show the hub's notice as one row above the composer (composer.answer.note).
  // Seeded as amb-core's answer-drafts-real check does: harness' main publishes a page of two drafted
  // mails, so its hub opens one batch card. Never '1. review' (it opens the page in a browser).
  const DRAFTS = 'release replies proof';
  const em = (i, to) => `<section data-kit="email" data-id="${i}" data-verb="draft"><p data-field="to">${to}</p><p data-field="subject">v5.9.1</p><p>x</p></section>`;
  const draftsHtml = '<section data-kit="checklist" data-id="plan" data-plan><ol>'
    + '<li data-id="b1" data-who="bise" data-did="drafted" data-draft="mail-lucas">reply to Lucas</li>'
    + '<li data-id="b2" data-who="bise" data-did="drafted" data-draft="mail-marc">reply to Marc</li></ol></section>'
    + em('mail-lucas', 'lucas@acme.test') + em('mail-marc', 'marc@acme.test');
  await harness();
  await say(`[[bash: printf '%s' '${draftsHtml}' > rel-proof.html && sb page publish rel-proof.html --id rel-proof --title '${DRAFTS}']]`);
  await click('bise', page.locator('[data-testid="app.sidebar.bise"]').first());
  const draftsRow = page.locator('[data-testid^="inbox.block.row."]', { hasText: DRAFTS }).first();
  const draftsCard = page.locator('[data-testid^="inbox.block.card."]', { hasText: /drafts?/ }).filter({ hasText: DRAFTS }).first();
  const answeringIt = async () => /answering/.test(((await page.locator('[data-testid="composer"]').first().innerText({ timeout: 1000 }).catch(() => '')) ?? ''));
  // the card is there within 90 s; then its row's click, else '+ N more' in turn, until it is the open one
  const listed = await until(async () => ((await draftsRow.isVisible().catch(() => false)) || (await draftsCard.isVisible().catch(() => false)) || /release replies proof|2 drafts/.test(((await text('[data-testid="inbox.block"]')) ?? '')) ? true : null), 90000, 1000);
  for (let i = 0; listed && i < 40 && !(await draftsCard.isVisible().catch(() => false)); i++) {
    if (await draftsRow.isVisible().catch(() => false)) await draftsRow.click({ timeout: 2000 }).catch(() => {});
    else await page.locator('[data-testid="inbox.block.more"]').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  const docked = await draftsCard.isVisible().catch(() => false);
  const answering = docked && await answeringIt();
  await shot('drafts-card-docked');
  let note = null;
  if (docked && answering) {
    const f = page.locator('[data-testid="composer.field"]:visible').first();
    await f.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('where are the drafts?', { delay: 10 });
    await page.keyboard.press('Enter');
    note = await until(async () => {
      const n = page.locator('[data-testid="composer.answer.note"]').first();
      if (!(await n.isVisible().catch(() => false))) return null;
      return { level: await n.getAttribute('data-level').catch(() => null), text: ((await n.innerText().catch(() => '')) ?? '').slice(0, 300) };
    }, 30000, 500);
    await shot('drafts-card-notice');
  }
  step("free words on a docked drafts card: the hub's notice row above the composer", !!note && note.level !== 'err' && /sent to/.test(note.text), { listed: !!listed, docked, answering, note, block: ((await text('[data-testid="inbox.block"]')) ?? '').slice(0, 300) });
  // the two-finger swipe (swipe.ts reads the renderer's wheel events): a horizontal wheel stream
  // through CDP, fingers right (deltaX < 0) walks back, fingers left forward. Events 20 ms apart
  // stay one gesture (GAP_MS 220); 8 x 30 px passes THRESHOLD_PX 140.
  const swipe = async (dx) => {
    const m = await page.locator('[data-testid="app.main"]').first().boundingBox().catch(() => null);
    if (m) await page.mouse.move(m.x + m.width / 2, m.y + m.height / 3);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(dx, 0); await new Promise((r) => setTimeout(r, 20)); }
    await new Promise((r) => setTimeout(r, 400));
  };
  await harness();
  await click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first());
  const onList = await page.locator('[data-testid="artifacts.list"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  await swipe(-30);
  const swBack = await until(async () => ((await page.locator('[data-testid="artifacts.list"]').count()) === 0 && /harness/.test((await text('[data-testid="app.main"]')) ?? '') ? true : null), 5000, 300);
  await shot('swipe-back');
  await swipe(30);
  const swFwd = await page.locator('[data-testid="artifacts.list"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  await shot('swipe-forward');
  step('two-finger swipe (CDP wheel deltaX): back, then forward', onList && !!swBack && swFwd, { on_list: onList, back: !!swBack, forward: swFwd });
  // 3f58f843 (ambient-lead m_21499): ⌘K finds pages by name: 'set' shows the pages group, and ⏎ on
  // its row opens settings (the selection walked down to it with ↓, as he would)
  await harness();
  await page.keyboard.press('Meta+k');
  const pal = await page.locator('[data-testid="app.palette"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  let kRow = { palette: pal };
  if (pal) {
    await page.keyboard.type('set', { delay: 40 });
    const groups = await until(async () => {
      const g = await page.locator('[data-testid^="app.palette.group."]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice('app.palette.group.'.length)));
      return g.includes('pages') ? g : null;
    }, 5000, 300);
    const at = await page.evaluate(() => {
      const num = (e) => (e ? Number(e.getAttribute('data-testid').split('.').pop()) : null);
      const first = document.querySelector('[data-testid="app.palette.group.pages"] [data-testid^="app.palette.item."]');
      return { want: num(first), cur: num(document.querySelector('[data-testid^="app.palette.item."][aria-selected="true"]')), name: first?.textContent?.slice(0, 80) ?? null };
    });
    await shot('palette-set');
    if (at.want !== null) for (let i = at.cur ?? 0; i < at.want; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const settings = await page.locator('[data-testid="settings.root"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    await shot('palette-set-enter');
    kRow = { palette: pal, groups, row: at, settings };
  }
  step("⌘K with 'set' shows the pages group, ⏎ opens settings", !!kRow.groups && !!kRow.settings, kRow);
  if (pal && !kRow.settings) await page.keyboard.press('Escape');
  // spacing (designer's desktop-spacing, steps 1-4): a frame per screen at 1100 wide. The viewport
  // is narrowed by CDP emulation, the native window doesn't move or resize.
  const cdp = await page.context().newCDPSession(page);
  const vh = await page.evaluate(() => window.innerHeight);
  const narrowed = await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: vh, deviceScaleFactor: 0, mobile: false }).then(() => true, () => false);
  await new Promise((r) => setTimeout(r, 600));
  const vw = await page.evaluate(() => window.innerWidth);
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const at1100 = {};
  await harness();
  await page.waitForTimeout(800);
  await shot('w1100-thread');
  at1100.thread = { overflow: await overflow() };
  // the frame: the title bar, both bars and the status line, with the right bar open
  if (!(await page.locator('[data-testid="app.panel"]').count())) await click('right bar', page.locator('[data-testid="app.title.panel"]').first());
  await page.waitForTimeout(600);
  await shot('w1100-frame');
  at1100.frame = { overflow: await overflow(), panel: (await page.locator('[data-testid="app.panel"]').count()) > 0 };
  await click('bise', page.locator('[data-testid="app.sidebar.bise"]').first());
  await page.locator('[data-testid^="inbox.block"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot('w1100-inbox');
  at1100.inbox = { overflow: await overflow(), block: (await page.locator('[data-testid^="inbox.block"]').count()) > 0 };
  await harness();
  await say('/agents');
  const agents = await page.locator('[data-testid="agents.screen"]').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  await shot('w1100-agents');
  at1100.agents = { overflow: await overflow(), screen: agents };
  // b4a25acb's spacing batch: artifacts, scheduled, /log, /diff (changes), ⌘K, settings and a menu
  const screen1100 = async (name, open, sel) => {
    await open();
    const there = sel ? await page.locator(sel).first().waitFor({ timeout: 10000 }).then(() => true, () => false) : true;
    await page.waitForTimeout(600);
    await shot(`w1100-${name}`);
    at1100[name] = { overflow: await overflow(), there };
  };
  await screen1100('artifacts', () => click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first()), '[data-testid="artifacts.screen"]');
  await screen1100('scheduled', () => click('scheduled', page.locator('[data-testid="app.sidebar.scheduled"]').first()), null);
  await screen1100('log', async () => { await harness(); await say('/log'); }, '[data-testid="log.list"]');
  await screen1100('changes', async () => { await harness(); await say('/diff'); }, '[data-testid="changes.screen"], [data-testid="review.screen"]');
  await page.keyboard.press('Escape');
  await screen1100('palette', async () => { await harness(); await page.keyboard.press('Meta+k'); }, '[data-testid="app.palette"]');
  await page.keyboard.press('Escape');
  await screen1100('settings', () => click('settings', page.locator('[data-testid="app.sidebar.settings"]').first()), '[data-testid="settings.root"]');
  const menuBtn = page.locator('[data-testid="settings.root"] [aria-haspopup]').first();
  const hasMenu = (await menuBtn.count()) > 0;
  if (hasMenu) await screen1100('settings-menu', () => click('a settings menu', menuBtn), '[role="menu"], [role="listbox"]');
  await page.keyboard.press('Escape');
  // b51422c0's batch (ambient-lead m_21481): settings' key field and its caption, the terminal
  // panel, a thread with a tool row and a code block, the selection tint and a quote chip
  // the key row lives on the keys page (accounts.tsx), not the page settings opens on
  await click('settings', page.locator('[data-testid="app.sidebar.settings"]').first());
  const keysNav = page.locator('[data-testid="settings.nav.keys"]').first();
  if (await keysNav.waitFor({ timeout: 5000 }).then(() => true, () => false)) await click('settings keys', keysNav);
  const keyAdd = page.locator('[data-testid="settings.key.add"]').first();
  if (await keyAdd.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    await screen1100('settings-key', () => click('add a key', keyAdd), '[data-testid="settings.key.field"]');
    await page.keyboard.press('Escape');
  } else at1100['settings-key'] = { overflow: false, there: false, why: 'no settings.key.add on this world' };
  await screen1100('terminal', async () => { await harness(); await page.keyboard.press('Control+Backquote'); }, '[data-testid="terminal.panel"]');
  if (at1100.terminal.there) {
    await page.keyboard.press('Control+Backquote');
    if (await page.locator('[data-testid="terminal.panel"]').first().isVisible().catch(() => false)) await click('hide the terminal', page.locator('[data-testid="terminal.hide"]').first());
  }
  step('the terminal panel opens at 1100 (⌃`)', at1100.terminal.there && !at1100.terminal.overflow, at1100.terminal);
  const md = path.join(out, 'code-reply.md');
  fs.writeFileSync(md, 'here is the proof, quote me if you like.\n\n```sh\necho proof-code\nls -la | head -3\n```\n\nthat was the code block.\n');
  await harness();
  await say(`[[bash: echo tool-row-proof]] [[reply: ${md}]]`);
  const coded = await until(async () => page.evaluate(() => {
    const list = document.querySelector('[data-testid="thread.list"]');
    const pre = [...(list?.querySelectorAll('pre') ?? [])].some((p) => p.textContent.includes('proof-code'));
    const tool = (list?.querySelectorAll('[data-testid^="thread.toolrow"]').length ?? 0) > 0;
    return pre && tool ? { pre, tool } : null;
  }), ANSWER_MS, 1000);
  await page.waitForTimeout(600);
  await shot('w1100-thread-code');
  at1100['thread-code'] = { overflow: await overflow(), there: !!coded };
  step('a thread with a tool row and a code block (the thread pass at 1100)', !!coded && !at1100['thread-code'].overflow, coded ?? 'no pre with proof-code, or no tool row');
  // select words of the reply: the tint is the theme's (no system blue), the pop offers the quote
  const tint = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="thread.list"]');
    const w = document.createTreeWalker(list ?? document.body, NodeFilter.SHOW_TEXT);
    let n = null;
    while (w.nextNode()) if (w.currentNode.textContent.includes('quote me if you like')) n = w.currentNode;
    if (!n) return null;
    const i = n.textContent.indexOf('quote me');
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + 'quote me if you like'.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    n.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { bg: getComputedStyle(n.parentElement, '::selection').backgroundColor, text: s.toString() };
  });
  const pop = await page.locator('[data-testid="thread.quote.pop"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  await shot('w1100-selection');
  step('the selection tint on thread text is the theme\'s, not the system blue', !!tint && !/rgba?\(0, 9\d, 2\d\d/.test(tint.bg) && tint.bg !== 'rgba(0, 0, 0, 0)', tint);
  let chip = null;
  if (pop) {
    await click('quote it', page.locator('[data-testid="thread.quote.pop.ask"]').first());
    chip = await until(async () => page.evaluate(() => {
      const c = document.querySelector('[data-testid="composer"]');
      const q = c?.querySelector('[data-testid*="quote"], .b-quote, [class*="quote"]');
      return q ? (q.textContent || '').slice(0, 120) : null;
    }), 5000, 300);
  }
  await page.waitForTimeout(400);
  await shot('w1100-quote-chip');
  at1100['quote-chip'] = { overflow: await overflow(), there: !!chip };
  step('selected words go to the composer as a quote chip', pop && !!chip, { pop, chip });
  await page.locator('[data-testid="composer"] [contenteditable="true"]').first().click().catch(() => {});
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Backspace');
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  // scroll up right after a thread opens stays up (dae80774: the list goes to its end once, then
  // leaves him where he scrolled)
  await click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first());
  await page.waitForTimeout(500);
  await harness();
  const listBox = await page.locator('[data-testid="thread.list"]').first().boundingBox({ timeout: 5000 }).catch(() => null);
  if (listBox) await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
  await page.waitForTimeout(150);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -150); await new Promise((r) => setTimeout(r, 30)); }
  const fromEnd = () => page.evaluate(() => {
    // the scroller is inside thread.list (ThreadList's scrollerRef, b4a25acb), on older builds around it
    const list = document.querySelector('[data-testid="thread.list"]');
    const scrolls = (x) => x.scrollHeight > x.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(x).overflowY);
    let e = list && [list, ...list.querySelectorAll('*')].find(scrolls);
    if (!e) { e = list; while (e && !scrolls(e)) e = e.parentElement; }
    return e ? { fromEnd: Math.round(e.scrollHeight - e.scrollTop - e.clientHeight), height: e.scrollHeight } : null;
  });
  const up0 = await fromEnd();
  await page.waitForTimeout(3000);
  const up1 = await fromEnd();
  await shot('scrolled-up-stays');
  step('scroll up right after a thread opens stays up (3 s later)', !!up0 && !!up1 && up0.fromEnd > 100 && up1.fromEnd > 100, { right_after: up0, three_s_later: up1 });
  step('the spotlight at 1100: not run (it opens a floating window over his screen)', true, 'not proven here');
  step('a frame per screen at 1100 wide (thread, frame, inbox, agents), nothing wider than the window',
    narrowed && vw === 1100 && agents && Object.values(at1100).every((s) => !s.overflow), { width: vw, ...at1100 });
  // the tray menu is native (Electron Tray in the main process): CDP reaches the renderer only
  step('the tray menu\'s inbox rows: not reachable off-screen (native menu, no CDP)', true, 'not proven here');
  // (e) and (f) seeds (ambient-lead m_21810): five more artifacts so ARTIFACTS passes its cap of 5,
  // and a PR artifact whose url is 'http://': browser-only for the window (models.ts leaves: a PR,
  // an http url) but refused by main's externalUrl (no host: new URL throws), so his browser can't open
  await harness();
  await say("[[bash: for i in 1 2 3 4 5; do printf 'more %s' $i > more-$i.md && sb artifact add more-$i.md --title more-$i; done; sb artifact add http:// --kind pr --title pr-proof]]");
  const rb = page.locator('[data-testid="app.panel"]').first();
  if (!(await rb.isVisible().catch(() => false))) await click('right bar', page.locator('[data-testid="app.title.panel"]').first());
  const moreBtn = page.locator('[data-testid="app.right.artifacts.more"]').first();
  const capped = await moreBtn.waitFor({ timeout: 60000 }).then(() => true, () => false);
  // (e) 8027d979: every head that folds is a row: pointer; hovered, the rows' tint and its '▾'
  const look = (id) => page.locator(`[data-testid="app.right.${id}.head"]`).first().evaluate((el) => {
    const label = el.querySelector('.app-rb-label');
    const row = el.parentElement;
    return { cursor: getComputedStyle(el).cursor, tint: row ? getComputedStyle(row).backgroundColor : '', chevron: label ? getComputedStyle(label, '::after').content : '', shown: label ? getComputedStyle(label, '::after').visibility : '' };
  }).catch(() => null);
  const heads = {};
  for (const id of ['agents', 'archived', 'artifacts', 'scheduled']) {
    await page.mouse.move(1, 400);
    await page.waitForTimeout(150);
    const rest = await look(id);
    await page.locator(`[data-testid="app.right.${id}.head"]`).first().hover({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
    heads[id] = { rest, hover: await look(id) };
    if (id === 'artifacts') await shot('right-head-hover');
  }
  await page.mouse.move(1, 400);
  const folding = ['archived', 'artifacts', 'scheduled'].filter((id) => heads[id].rest);
  step('right bar: the section heads that fold show a pointer and tint on hover',
    folding.length > 0 && folding.every((id) => heads[id].rest.cursor === 'pointer' && heads[id].hover?.tint !== heads[id].rest.tint), heads);
  const artRows = () => page.locator('[data-testid="app.right.artifacts"] [data-testid^="app.right.artifact."]').evaluateAll((es) => es.filter((e) => !/\.leaves$/.test(e.getAttribute('data-testid'))).length).catch(() => null);
  let ml = { capped };
  if (capped) {
    ml.more_text = (await moreBtn.innerText().catch(() => '')).trim();
    ml.rows_capped = await artRows();
    await click("'+ N more'", moreBtn);
    const less = page.locator('[data-testid="app.right.artifacts.less"]').first();
    ml.less_text = await less.innerText({ timeout: 3000 }).then((t) => t.trim(), () => null);
    ml.rows_open = await artRows();
    ml.more_gone = (await page.locator('[data-testid="app.right.artifacts.more"]').count()) === 0;
    await shot('right-show-less');
    await click("'show less'", less);
    await page.waitForTimeout(300);
    ml.rows_back = await artRows();
    ml.more_back = (await moreBtn.innerText({ timeout: 3000 }).catch(() => '')).trim();
    ml.head_in_view = await page.locator('[data-testid="app.right.artifacts.head"]').first().isVisible().catch(() => false);
  }
  step("right bar: '+ N more' -> every row and 'show less' -> back at the cap", capped && /^\+ \d+ more$/.test(ml.more_text) && ml.less_text === 'show less' && ml.more_gone && ml.rows_open > ml.rows_capped && ml.rows_back === ml.rows_capped && ml.more_back === ml.more_text, ml);
  // (f) 1a79de8a: a PR artifact's click calls window.bise.openExternal and opens no panel. Seen
  // from a logpoint on the preload's openExternal (CDP Debugger, a condition that logs and never
  // pauses); the url is refused in main, so nothing reaches his browser (gate A watches anyway)
  const prRow = page.locator('[data-testid^="app.right.artifact."][data-testid$=".pr-proof"]').first();
  const prThere = await prRow.waitFor({ timeout: 20000 }).then(() => true, () => false);
  const dbg = await page.context().newCDPSession(page).catch(() => null);
  const ext = [];
  let bp = null;
  if (dbg && prThere) {
    const scripts = [];
    dbg.on('Debugger.scriptParsed', (e) => scripts.push(e));
    dbg.on('Runtime.consoleAPICalled', (e) => { const v = e.args?.[0]?.value; if (typeof v === 'string' && v.startsWith('AHD-EXT ')) ext.push(v.slice(8)); });
    await dbg.send('Runtime.enable').catch(() => {});
    await dbg.send('Debugger.enable').catch(() => {});
    await page.waitForTimeout(800);
    for (const s of scripts) {
      if (bp) break;
      const src = (await dbg.send('Debugger.getScriptSource', { scriptId: s.scriptId }).catch(() => null))?.scriptSource ?? '';
      const m = /openExternal:\s*async\s*\(?(\w+)\)?\s*=>\s*/.exec(src);
      if (!m) continue;
      const at = m.index + m[0].length;
      const head = src.slice(0, at);
      const line = head.split('\n').length - 1;
      const col = at - (head.lastIndexOf('\n') + 1);
      bp = await dbg.send('Debugger.setBreakpoint', {
        location: { scriptId: s.scriptId, lineNumber: line + (s.startLine ?? 0), columnNumber: col + (line === 0 ? (s.startColumn ?? 0) : 0) },
        condition: `console.log('AHD-EXT ' + String(${m[1]})), false`,
      }).then((r) => ({ id: r.breakpointId, url: s.url, param: m[1] }), (e) => ({ error: String(e).slice(0, 200) }));
    }
  }
  let pr = { row: prThere, logpoint: bp };
  if (prThere) {
    pr.leaves = await page.locator('[data-testid^="app.right.artifact."][data-testid$=".pr-proof.leaves"]').first().innerText({ timeout: 2000 }).catch(() => null);
    const screenBefore = await page.locator('[data-testid="thread.screen"]').first().getAttribute('data-agent').catch(() => null);
    await click('the PR artifact in the right bar', prRow);
    await page.waitForTimeout(1500);
    pr = { ...pr, external_calls: [...ext], panel: await page.locator('[data-testid="artifact.open"], [data-testid="artifact.page"], [data-testid="app.art"]').count(), thread_before: screenBefore,
      thread_after: await page.locator('[data-testid="thread.screen"]').first().getAttribute('data-agent').catch(() => null) };
    await shot('pr-artifact-click');
  }
  if (dbg) {
    if (bp?.id) await dbg.send('Debugger.removeBreakpoint', { breakpointId: bp.id }).catch(() => {});
    await dbg.send('Debugger.disable').catch(() => {});
    await dbg.detach().catch(() => {});
  }
  const called = !!bp?.id && pr.external_calls?.length === 1 && pr.external_calls[0] === 'http://';
  step('a PR artifact: a click calls openExternal (seen in the preload) and opens no panel', called && pr.panel === 0 && pr.thread_after === pr.thread_before, pr);
  // (g) bae706f4: the maker dropped (its own artifact made), the artifact opened from the right bar,
  // the maker's head beside it at 1100: it ends at its column, never under the panel, restore whole
  // inside it, one line
  const makerArt = page.locator('[data-testid^="app.right.artifact."][data-testid$=".rel-ts-notes"]').first();
  // (e) left the list at its cap: the maker's row (older than the more-N ones) sits behind '+ N more'
  const expand = async () => {
    const more = page.locator('[data-testid="app.right.artifacts.more"]').first();
    if (await more.isVisible().catch(() => false)) await click("the artifacts' '+ N more'", more);
  };
  await expand();
  const made = await makerArt.waitFor({ timeout: 60000 }).then(() => true, () => false);
  await say(`[[bash: sb drop ${MAKER}]]`);
  const dropCard = page.locator('[data-testid^="dock.opt"], [data-testid^="composer.opt"]').filter({ hasText: /yes|drop/i }).first();
  const dropAsked = await dropCard.waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (dropAsked) await click(`answer ${MAKER}'s drop card 'yes'`, dropCard);
  const archived = await until(async () => (/release-ts/.test((await text('[data-testid="app.right.archived"]')) ?? '') && !/release-ts/.test((await text('[data-testid="app.right.agents"]')) ?? '') ? true : null), 60000, 1000);
  let gh = { made, drop_card: dropAsked, archived: !!archived };
  if (made && archived) {
    await expand();
    await click(`${MAKER}'s artifact from the right bar`, makerArt);
    const open = await page.locator('[data-testid="app.art"]').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    const vh2 = await page.evaluate(() => window.innerHeight);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: vh2, deviceScaleFactor: 0, mobile: false }).catch(() => {});
    await page.waitForTimeout(800);
    await page.mouse.move(1, 400);
    gh = { ...gh, open, ...(await page.evaluate(() => {
      const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
      const head = document.querySelector('[data-testid="thread.head"]');
      const restore = document.querySelector('[data-testid="thread.head.restore"]');
      return {
        agent: document.querySelector('[data-testid="thread.screen"]')?.getAttribute('data-agent') ?? null,
        head: b('[data-testid="thread.head"]'), column_right: head?.parentElement ? Math.round(head.parentElement.getBoundingClientRect().right) : null,
        art: b('[data-testid="app.art"]'), restore: b('[data-testid="thread.head.restore"]'), restore_text: restore?.textContent?.trim() ?? null,
        restore_cut: restore ? restore.scrollWidth > restore.clientWidth : null, width: window.innerWidth,
      };
    })) };
    await shot('archived-maker-head-1100');
    await page.locator('[data-testid="thread.head"]').first().screenshot({ path: path.join(out, `${mode}${tag}-${++n}-archived-maker-head.png`), timeout: 5000 }).then(() => res.shots.push(path.join(out, `${mode}${tag}-${n}-archived-maker-head.png`)), () => {});
    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    await closeArtifact();
  }
  const fits = !!gh.head && !!gh.restore && gh.column_right !== null && gh.head.right <= gh.column_right + 1
    && (!gh.art || gh.art.x <= gh.head.x || gh.head.right <= gh.art.x + 1) && gh.restore.right <= gh.head.right + 1 && gh.restore_cut === false && gh.head.h === 44;
  step("an archived maker's head beside its artifact at 1100: restore inside its column", gh.agent === MAKER && gh.width === 1100 && fits, gh);
  await harness();
  await fileChips(harness);
  await quickRows(harness, say);
}

// quick: the quick rows alone, a follow-up pass on a candidate (cand.sh AS_HE_DOES_ONLY=quick)
if (mode === 'quick') {
  const composerOf = () => page.locator('[data-testid="composer"] [contenteditable="true"], [data-testid="composer"] textarea').first();
  const say = async (words) => {
    if (!(await click(`say ${words.slice(0, 30)}`, composerOf()))) return false;
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(words, { delay: 5 });
    await page.keyboard.press('Enter');
    return true;
  };
  const harness = () => click('open harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  await closeArtifact();
  await quickRows(harness, say);
  await newRows(harness, say);
}

// d0d45f92's rows (ambient-lead m_22519): the help sheet opaque, esc never stops a turn and ctrl+c
// does (f8a5b459), a quote chip mid-sentence stays at its place in the bubble and the model's
// request (8ed6bf27), settings › approvals walks with the list keys (dda351fc) and ⌘I, the fn
// talk's corner card (666d9549) with its window frame under the off-screen rule. Each row is its
// own try: a row that throws is a red step, the next rows still run.
async function newRows(harness, say) {
  const row = async (name, fn) => {
    try { await fn(); } catch (e) { step(name, false, String(e).slice(0, 300)); }
  };
  const field = page.locator('[data-testid="composer.field"]:visible').first();
  const clear = async () => {
    await field.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
  };
  const body = async () => (await page.evaluate(() => document.body.innerText).catch(() => '')) ?? '';

  await row('help sheet', async () => {
    await harness();
    await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
    await page.keyboard.press('Meta+/');
    const over = page.locator('[data-testid="help.overlay"]').first();
    const open = await over.waitFor({ timeout: 4000 }).then(() => true, () => false);
    // the sheet: the overlay's first descendant drawn with a background; opaque = alpha 1
    const bg = open ? await over.evaluate((o) => {
      const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
      for (const el of o.querySelectorAll('*')) {
        const c = getComputedStyle(el).backgroundColor;
        if (alpha(c) > 0 && el.getBoundingClientRect().width > 200) return { cls: el.className, color: c, alpha: alpha(c) };
      }
      return null;
    }) : null;
    await shot('help-sheet');
    step('the help sheet (⌘/) is opaque on the scrim', open && bg !== null && bg.alpha === 1, { open, bg });
    if (open) await page.keyboard.press('Escape');
  });

  await row('esc / ctrl+c during a turn', async () => {
    await harness();
    await clear();
    await say('[[slow: 40]] a long turn to stop');
    const keyLine = async () => /ctrl\+c stop/.test(await body());
    const working = await until(async () => ((await keyLine()) ? true : null), 20000, 500);
    await field.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.type('garde ça', { delay: 10 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);
    const afterEsc = { keyLine: await keyLine(), stopping: (await page.locator('[data-testid="thread.stopping"]').count()) > 0 };
    step('esc during a turn does not stop it (the turn still runs 2.5 s later)', !!working && afterEsc.keyLine && !afterEsc.stopping, { working: !!working, afterEsc });
    // esc with words puts them away to history (keys.ts putAway, ↑ brings them back): a new draft
    // for ctrl+c to keep
    await field.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.type('garde ça', { delay: 10 });
    await page.keyboard.press('Control+c');
    const stopping = await until(async () => {
      const s = (await page.locator('[data-testid="thread.stopping"]').count()) > 0;
      const gone = !(await keyLine());
      return s || gone ? { stopping: s, keyLineGone: gone } : null;
    }, 15000, 300);
    const draft = ((await field.innerText({ timeout: 2000 }).catch(() => '')) ?? '').trim();
    await shot('ctrl-c-stopped');
    step('ctrl+c stops the turn; the draft stays', !!stopping && draft.includes('garde ça'), { stopping, draft });
    await clear();
  });

  await row('quote mid-sentence', async () => {
    await harness();
    await clear();
    await say('[[reply: QUOTE_SRC]] please answer');
    // the fake provider answers 'QUOTE_SRC' as a path it can't read: any words of the last answer do
    const src = await until(async () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="thread.list"] [data-testid^="thread.entry."]')].filter((r) => r.getAttribute('data-side') !== 'me' && r.getAttribute('data-kind') !== 'tool');
      const last = rows.at(-1);
      const w = last ? document.createTreeWalker(last, NodeFilter.SHOW_TEXT) : null;
      while (w?.nextNode()) { const t = w.currentNode.textContent.trim(); if (t.split(/\s+/).length >= 3) return t.split(/\s+/).slice(0, 3).join(' '); }
      return null;
    }), 30000, 1000);
    await field.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.type('before ', { delay: 10 });
    let pop = false;
    if (src) {
      await page.evaluate((words) => {
        const list = document.querySelector('[data-testid="thread.list"]');
        const w = document.createTreeWalker(list ?? document.body, NodeFilter.SHOW_TEXT);
        let n = null;
        while (w.nextNode()) if (w.currentNode.textContent.includes(words)) n = w.currentNode;
        if (!n) return;
        const i = n.textContent.indexOf(words);
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + words.length);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        n.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }, src);
      pop = await page.locator('[data-testid="thread.quote.pop"]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
      if (pop) await page.locator('[data-testid="thread.quote.pop.ask"]').first().click({ timeout: 3000 }).catch(() => {});
    }
    // the caret after the chip: his words go on after it
    await page.waitForTimeout(400);
    await page.keyboard.type(' after', { delay: 10 });
    const chip = (await field.locator('[data-kind="quote"]').count()) > 0;
    const inField = ((await field.innerText({ timeout: 2000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ');
    await shot('quote-mid-sentence-field');
    await page.keyboard.press('Enter');
    // the bubble: before, the quote, after, in that order
    const bubble = await until(async () => page.evaluate(() => {
      // his bubble, never bise's ack that echoes 'before … after' (cand-e91f98d7 run): it holds the chip
      const mine = [...document.querySelectorAll('[data-testid="thread.list"] [data-testid^="thread.entry."]')].filter((r) => (r.textContent ?? '').includes('before') && (r.textContent ?? '').includes('after') && /[❝“]/.test(r.textContent ?? ''));
      const b = mine.at(-1);
      if (!b) return null;
      const t = b.textContent ?? '';
      // the bubble's own words (its text parts, not the quote card above them): before, the chip, after
      const parts = b.querySelector('[data-testid$=".parts"]') ?? b;
      const words = (parts.textContent ?? '').replace(/\s+/g, ' ');
      const chip = words.search(/[❝“"]\s*1/);
      return { text: t.slice(0, 300), words: words.slice(0, 200), order: [words.indexOf('before'), chip, words.indexOf('after', Math.max(chip, 0))] };
    }), 10000, 500);
    await shot('quote-mid-sentence-bubble');
    const inPlace = (o) => !!o && o[0] >= 0 && o[1] > o[0] && o[2] > o[1];
    step('a quote chip mid-sentence stays at its place in the bubble (before, the quote, after)', pop && chip && !!bubble && inPlace(bubble.order), { src, pop, chip, inField: inField.slice(0, 200), bubble });
    // the model's request: the user message holds before, the quoted words, after, in that order
    const LOG = process.env.AS_HE_DOES_FAKE_LOG;
    const req = await until(async () => {
      if (!LOG || !fs.existsSync(LOG)) return null;
      const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('before') && l.includes('after'));
      if (lines.length === 0) return null;
      const j = JSON.parse(lines.at(-1));
      const u = typeof j.user === 'string' ? j.user : JSON.stringify(j.user ?? j.last_user ?? j);
      return { user: u.slice(0, 400), order: [u.indexOf('before'), src ? u.indexOf(src) : -1, u.indexOf('after')] };
    }, 30000, 1000);
    step("the quote sits at its place in the model's request too (before, the quote, after)", !!req && inPlace(req.order), req ?? { log: LOG ?? 'AS_HE_DOES_FAKE_LOG not set' });
    await clear();
  });

  await row('approvals walk', async () => {
    await click('settings', page.locator('[data-testid="app.sidebar"]').getByText('settings', { exact: true }).first());
    const nav = page.locator('[data-testid="settings.nav.approvals"]').first();
    if (!(await nav.count())) await page.getByText('approvals', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    else await nav.click({ timeout: 5000 }).catch(() => {});
    const rows = page.locator('[data-testid="settings.approvals.rules"] .b-gi');
    const n = await until(async () => { const c = await rows.count(); return c >= 3 ? c : null; }, 8000, 400);
    const sel = () => page.evaluate(() => {
      const all = [...document.querySelectorAll('[data-testid="settings.approvals.rules"] .b-gi')];
      return all.findIndex((r) => r.classList.contains('is-sel'));
    });
    await page.evaluate(() => { document.querySelector('.settings-approvals')?.focus(); });
    const s0 = await sel();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    const s1 = await sel();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    const s2 = await sel();
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);
    const s3 = await sel();
    await shot('approvals-walk');
    // ↓ selects (or moves), ↓ moves one down, ↑ comes back
    step('settings › approvals walks with ↓↓↑ (3 saved rules)', !!n && s1 >= 0 && s2 === s1 + 1 && s3 === s1, { n, s0, s1, s2, s3 });
    // ⌘I: the inbox (a native menu accelerator in the packed app: CDP keys may not reach it)
    await page.keyboard.press('Meta+i');
    await page.waitForTimeout(800);
    const inbox = await page.evaluate(() => !!document.querySelector('[data-testid^="inbox"], [data-testid="app.inbox"]'));
    await shot('cmd-i');
    step('⌘I opens the inbox (CDP key; a native menu accelerator would not get it)', inbox, { inbox });
    await page.keyboard.press('Escape');
  });

  await row('corner card', async () => {
    const VOICE = process.env.AS_HE_DOES_VOICE;
    if (!VOICE) { step('the fn talk corner card', false, 'no fake voice (AS_HE_DOES_VOICE)'); return; }
    await harness();
    fs.writeFileSync(VOICE, 'what time is it');
    // amb-mac e3e5b750: off-screen, each capsule show/move appends where place.ts would put it
    const CFR = process.env.AS_HE_DOES_USERDATA ? path.join(process.env.AS_HE_DOES_USERDATA, 'capsule-frames.jsonl') : null;
    const cfrLines = () => { try { return fs.readFileSync(CFR, 'utf8').split(String.fromCharCode(10)).filter(Boolean); } catch { return []; } };
    const cfrBefore = cfrLines().length;
    // no helper off-screen: the talk starts and ends as the capsule's fn would send them
    await page.evaluate(() => window.bise.core.send({ cmd: 'talk_start' }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.bise.core.send({ cmd: 'talk_end' }));
    const capPage = () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('surface=capsule'));
    const seen = await until(async () => {
      const cp = capPage();
      if (!cp) return null;
      const r = await cp.evaluate(() => ({
        card: !!document.querySelector('[data-testid="capsule.card"]'),
        talk: document.querySelector('[data-testid="capsule.talk.words"]')?.textContent ?? null,
        answer: document.querySelector('[data-testid="capsule.answer"]')?.textContent?.slice(0, 200) ?? null,
      }));
      return r.card && r.answer ? r : null;
    }, 30000, 500);
    let frame = null;
    const cp = capPage();
    if (cp) {
      // Electron's CDP has no Browser.getWindowForTarget: the page's own window.screenX/Y is its frame
      try {
        frame = await cp.evaluate(() => ({ bounds: { left: window.screenX, top: window.screenY, width: window.outerWidth, height: window.outerHeight }, screen: { w: window.screen.width, h: window.screen.height } }));
      } catch (e) { frame = { error: String(e).slice(0, 200) }; }
      try { await cp.screenshot({ path: path.join(out, `${mode}${tag}-corner-card.png`) }); res.shots.push(path.join(out, `${mode}${tag}-corner-card.png`)); save(); } catch { /* the steps say enough */ }
    }
    // the talk itself, without the card: his words reach the model (the capsule enters a talk only
    // from the helper's fn, machine.ts, and off-screen runs no helper, offscreen.ts)
    const LOG = process.env.AS_HE_DOES_FAKE_LOG;
    const heard = LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').includes('what time is it') : null;
    step("the fn talk's words reach main's model (core talk_start/talk_end)", heard === true, { log: LOG ?? 'AS_HE_DOES_FAKE_LOG not set', heard });
    step('the fn talk corner card: his words and the answer', !!seen, seen ?? { capsule: !!cp, why: 'off-screen has no helper: the capsule never enters a talk from a core talk_start alone' });
    // where the card would sit on his display (capsule-frames.jsonl): bottom-right 16 px inside the
    // work area (capsuleframe.test.ts); the real window stays parked off every screen
    const recs = cfrLines().slice(cfrBefore).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const corner = recs.filter((r) => r.mode === 'corner');
    const ruleOf = (r) => ({ ev: r.ev, dock: r.dock, right: r.bounds.x + r.bounds.width, wantRight: r.work.x + r.work.width - 16, bottom: r.bounds.y + r.bounds.height, wantBottom: r.work.y + r.work.height - 16, bounds: r.bounds, parked: r.parked });
    const rules = corner.map(ruleOf);
    const ruleOk = rules.length > 0 && rules.every((r) => r.right === r.wantRight && r.bottom === r.wantBottom);
    step('the corner card frame: bottom-right 16 px inside the work area (capsule-frames.jsonl)', ruleOk, rules.length ? rules : { file: CFR ?? 'AS_HE_DOES_USERDATA not set', records: recs.length, why: recs.length ? 'no corner show' : 'no capsule show off-screen (no helper fn): nothing written' });
    // off-screen rule (offscreen.ts): every window at -30000, never on a screen; the file's parked
    // frame first, else the page's own screenX/Y
    const parked = corner.map((r) => r.parked);
    const off = parked.length ? parked.every((p) => p.x <= -20000 || p.y <= -20000)
      : !!frame?.bounds && (frame.bounds.left <= -20000 || frame.bounds.top <= -20000 || frame.bounds.windowState === 'minimized');
    step('its window frame is off every screen (the off-screen rule: -30000)', off, parked.length ? { parked } : frame);
    const t0 = Date.now();
    const closed = await until(async () => {
      const r = await capPage()?.evaluate(() => !document.querySelector('[data-testid="capsule.card"]')).catch(() => null);
      return r ? Date.now() - t0 : null;
    }, 20000, 500);
    step('the corner card closes by itself (8 s linger)', closed !== null && closed <= 14000, { closedAfterMs: closed });
  });
}

// 276074b2's quick rows (ambient-lead m_22369), in harness' thread: '?' and space type (281879ed),
// an opened run_typescript box shows its source (1f5819a7), ⌘ hints at 150 ms (e4394a9e), and
// /artifacts ↓↓⏎ (f3fa6edb's list keys)
async function quickRows(harness, say) {
  const field = page.locator('[data-testid="composer.field"]:visible').first();
  const fieldText = async () => ((await field.innerText({ timeout: 2000 }).catch(() => null)) ?? '').trim();
  const clear = async () => {
    await field.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
  };
  await harness();
  // '?' is his to type: a message may start with it, no help sheet
  await clear();
  await page.keyboard.type('?ok', { delay: 20 });
  await page.waitForTimeout(400);
  const q = { field: await fieldText(), help: (await page.locator('[data-testid="help.overlay"]').count()) > 0 };
  step("'?' types into the composer (no help sheet)", q.field.startsWith('?ok') && !q.help, q);
  if (q.help) await page.keyboard.press('Escape');
  // space with nothing focused types into the composer
  await clear();
  await page.keyboard.type('abc', { delay: 20 });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.waitForTimeout(200);
  const blurred = await page.evaluate(() => document.activeElement === document.body);
  await page.keyboard.press('Space');
  await page.keyboard.type('d');
  await page.waitForTimeout(400);
  const sp = { blurred, field: await fieldText() };
  step('space with nothing focused types into the composer', sp.field === 'abc d', sp);
  await clear();
  // a run_typescript call, opened: the program it ran, never its args' JSON, and the TUI's 'ƒ' sign
  const before = await page.locator('[data-testid^="thread.tool."][role="button"]').count();
  await say('[[ts: const answer = 40 + 2; return answer;]]');
  const tool = await until(async () => {
    const n = await page.locator('[data-testid^="thread.tool."][role="button"]').count();
    return n > before ? page.locator('[data-testid^="thread.tool."][role="button"]').last() : null;
  }, 60000, 1000);
  let ts = { row: null, code: null, opened: false };
  if (tool) {
    const id = await tool.getAttribute('data-testid');
    ts.row = ((await tool.innerText().catch(() => '')) ?? '').slice(0, 200);
    await tool.scrollIntoViewIfNeeded().catch(() => {});
    await tool.click({ timeout: 3000 }).catch(() => {});
    const code = page.locator(`[data-testid="${id}.code"]`).first();
    ts.opened = await code.waitFor({ timeout: 8000 }).then(() => true, () => false);
    ts.code = ts.opened ? ((await code.innerText().catch(() => '')) ?? '').slice(0, 300) : null;
    await shot('run-typescript-open');
  }
  step('an opened run_typescript box shows the program it ran (not its JSON), its row signed ƒ',
    ts.opened && /const answer = 40 \+ 2/.test(ts.code ?? '') && !/"code"\s*:/.test(ts.code ?? '') && /ƒ/.test(ts.row ?? ''), ts);
  // ⌘ hints: none at 60 ms, there at 250 ms (150 ms delay), gone on release
  const hintN = () => page.evaluate(() => document.querySelectorAll('.app-keyhint').length);
  await page.locator('[data-testid="app.main"]').first().click({ position: { x: 40, y: 140 } }).catch(() => {});
  await page.keyboard.down('Meta');
  await page.waitForTimeout(60);
  const at60 = await hintN();
  await page.waitForTimeout(190);
  const at250 = await hintN();
  await page.keyboard.up('Meta');
  await page.waitForTimeout(200);
  const after = await hintN();
  step('⌘ hints show after 150 ms: none at 60 ms, there at 250 ms, gone on release', at60 === 0 && at250 > 0 && after === 0, { at60, at250, after });
  // /artifacts: the first row selected on open, ↓↓ moves to the third, ⏎ opens it
  await click('artifacts', page.locator('[data-testid="app.sidebar.artifacts"]').first());
  const rows = page.locator('[data-testid^="artifacts.list.row."]');
  await rows.first().waitFor({ timeout: 8000 }).catch(() => {});
  const selected = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-testid^="artifacts.list.row."]')];
    return { n: all.length, at: all.findIndex((r) => r.getAttribute('aria-selected') === 'true'), title: all.find((r) => r.getAttribute('aria-selected') === 'true')?.textContent?.trim().slice(0, 60) ?? null };
  });
  await page.evaluate(() => { document.querySelector('[data-testid="artifacts.screen"]')?.focus(); });
  const s0 = await selected();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const s2 = await selected();
  await page.keyboard.press('Enter');
  const opened = await page.locator('[data-testid="app.art"], [data-testid="artifact.page"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  await shot('artifacts-down-down-enter');
  // the selection comes back for 10 minutes (listkeys keepAs 'artifacts.sel:<project>'): an earlier
  // pass that opened an artifact leaves its row selected, so ↓↓ is read from wherever it starts
  // (cand-2760: 16 → 18 of 19); the first row on a fresh open is artifacts.test.tsx's
  // a quick world may hold fewer than 3 artifacts (cand-2760q: 1): ↓↓ stops on the last row there
  const want = Math.min(s0.at + 2, s0.n - 1);
  step(`/artifacts: a row selected on open (the first, or the one kept), ↓↓ moves two down${s0.n < 3 ? ` (only ${String(s0.n)} row(s): stops on the last)` : ''}, ⏎ opens it`, s0.n >= 1 && s0.at >= 0 && s2.at === want && opened, { first: s0, after_down_down: s2, want, opened });
  await closeArtifact();
  await harness();
}

// (f1) ad753852's file chips (ambient-lead m_22068): a Finder drop (CDP's drag, the desktop checks'
// dropFiles) of a pdf, csv, xlsx, docx and pptx on harness' composer; the hub's 'you' entry; his
// bubble; a click / right-click; a file gone at send time; a csv dropped while answering a card.
// The files live in <out>/file-chips: outside the app's home and every world project, so main's
// fence (ipc.ts lookable) refuses a preview or a reveal and nothing reaches his screen. The calls
// are seen from logpoints on the preload's quickLook / showInFinder (this build has no test mode,
// so no 'bise-desktop: quicklook' line).
async function fileChips(harness) {
  const FD = path.join(out, 'file-chips');
  fs.rmSync(FD, { recursive: true, force: true });
  fs.mkdirSync(FD, { recursive: true });
  const DOCS = ['q3.pdf', 'data.csv', 'plan.xlsx', 'brief.docx', 'deck.pptx'];
  const NL = String.fromCharCode(10);
  for (const d of DOCS) fs.writeFileSync(path.join(FD, d), `fake ${d}${NL}`);
  const at = (d) => path.join(FD, d);
  const appHome = await page.evaluate(() => window.bise?.home ?? null).catch(() => null);
  const fenced = !!appHome && !FD.startsWith(`${appHome}/`);
  const drop = async (sel, files) => {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!box) return false;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const s = await page.context().newCDPSession(page);
    const data = { items: [], files, dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await s.send('Input.dispatchDragEvent', { type, x, y, data });
    await s.detach().catch(() => {});
    return true;
  };
  // the home hubs' journals (the world's, under the app's home): the msg rows that carry word
  const journal = (word) => {
    const rows = [];
    const hubs = appHome ? path.join(appHome, '.bise', 'hubs') : null;
    for (const h of hubs && fs.existsSync(hubs) ? fs.readdirSync(hubs) : []) {
      const f = path.join(hubs, h, 'journal.jsonl');
      if (!fs.existsSync(f)) continue;
      for (const l of fs.readFileSync(f, 'utf8').split(NL)) {
        if (!l.includes(word)) continue;
        try {
          const j = JSON.parse(l);
          const m = j.msg ?? j;
          const parts = typeof m.parts === 'string' ? JSON.parse(m.parts) : m.parts;
          rows.push({ hub: h, type: j.type ?? null, from: m.from ?? null, to: m.to ?? null, parts: Array.isArray(parts) ? parts : null, text: String(m.text ?? '').slice(0, 300) });
        } catch { /* not a json row */ }
      }
    }
    return rows;
  };
  const field = page.locator('[data-testid="composer.field"]:visible').first();
  const fileChip = page.locator('[data-testid^="composer.chip."][data-kind="file"]');
  const fresh = async (words) => {
    await field.click({ timeout: 5000 }).catch(() => {});
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(words, { delay: 5 });
  };

  // the drop: one file chip each, in the drop order
  await fresh('here are the files zqfiles ');
  const dropped = await drop('[data-testid="composer.field"]:visible', DOCS.map(at));
  const five = await until(async () => ((await fileChip.count()) === DOCS.length ? true : null), 8000, 300);
  const names = (await fileChip.allInnerTexts().catch(() => [])).map((t) => t.replace('▯', '').trim());
  await shot('file-chips-composer');
  step('(f1) a drop of a pdf, csv, xlsx, docx and pptx on the composer: one data-kind=file chip each, in order', dropped && !!five && JSON.stringify(names) === JSON.stringify(DOCS), { dropped, names, fenced, app_home: appHome });

  // deck.pptx goes before the send: the hub finds it gone, the bubble says '· missing'
  fs.rmSync(at('deck.pptx'), { force: true });
  await page.keyboard.press('Enter');
  const entry = await until(async () => journal('zqfiles').find((r) => r.parts?.some((p) => p.kind === 'file')) ?? null, 30000, 1000);
  const fparts = (entry?.parts ?? []).filter((p) => p.kind === 'file');
  step("(f1) the hub's 'you' entry carries the Part::File parts in order (his words first, deck.pptx missing)",
    !!entry && entry.parts?.[0]?.kind === 'text' && JSON.stringify(fparts.map((p) => p.path)) === JSON.stringify(DOCS.map(at))
      && fparts.every((p) => /^\[File #\d+\]$/.test(String(p.name))) && fparts.find((p) => p.path === at('deck.pptx'))?.missing === true
      && fparts.filter((p) => p.missing).length === 1,
    entry ? { ...entry, parts: entry.parts?.map((p) => ({ kind: p.kind, name: p.name, path: p.path ? path.basename(p.path) : undefined, missing: p.missing, text: p.text })) } : journal('zqfiles').slice(0, 2));
  const bubble = page.locator('[data-testid^="thread.you."][data-testid$=".parts"]').filter({ hasText: 'q3.pdf' }).last();
  const drawn = await bubble.waitFor({ timeout: 20000 }).then(() => true, () => false);
  const bchips = bubble.locator('[data-kind="file"]');
  const gone = bchips.filter({ hasText: 'deck.pptx' }).first();
  const bub = drawn ? {
    names: (await bchips.allInnerTexts().catch(() => [])).map((t) => t.replace(/[▯\s]+/g, ' ').trim()),
    gone_text: ((await gone.innerText().catch(() => '')) ?? '').trim(),
    gone_title: await gone.getAttribute('title').catch(() => null),
    q3_title: await bchips.filter({ hasText: 'q3.pdf' }).first().getAttribute('title').catch(() => null),
  } : null;
  await page.mouse.move(1, 300);
  await shot('file-chips-bubble');
  step("(f1) his bubble draws a chip per file, '· missing' on the one gone at send time",
    drawn && bub.names.length === DOCS.length && /· missing/.test(bub.gone_text) && /deck\.pptx is gone from /.test(bub.gone_title ?? '') && /preview · right-click: show in Finder/.test(bub.q3_title ?? ''), bub);

  // a click -> quickLook(path), a right-click -> showInFinder(path), the gone one calls nothing
  const calls = [];
  const dbg = await page.context().newCDPSession(page).catch(() => null);
  const bps = [];
  if (dbg && fenced) {
    const scripts = [];
    dbg.on('Debugger.scriptParsed', (e) => scripts.push(e));
    dbg.on('Runtime.consoleAPICalled', (e) => { const v = e.args?.[0]?.value; if (typeof v === 'string' && v.startsWith('AHD-F ')) calls.push(v.slice(6)); });
    await dbg.send('Runtime.enable').catch(() => {});
    await dbg.send('Debugger.enable').catch(() => {});
    await page.waitForTimeout(800);
    for (const s of scripts) {
      const src = (await dbg.send('Debugger.getScriptSource', { scriptId: s.scriptId }).catch(() => null))?.scriptSource ?? '';
      for (const fn of ['quickLook', 'showInFinder']) {
        const m = new RegExp(`${fn}:\\s*async\\s*\\(?(\\w+)\\)?\\s*=>\\s*`).exec(src);
        if (!m || bps.some((b) => b.fn === fn)) continue;
        const where = m.index + m[0].length;
        const head = src.slice(0, where);
        const line = head.split(NL).length - 1;
        const col = where - (head.lastIndexOf(NL) + 1);
        const r = await dbg.send('Debugger.setBreakpoint', {
          location: { scriptId: s.scriptId, lineNumber: line + (s.startLine ?? 0), columnNumber: col + (line === 0 ? (s.startColumn ?? 0) : 0) },
          condition: `console.log('AHD-F ${fn} ' + String(${m[1]})), false`,
        }).catch((e) => ({ error: String(e).slice(0, 200) }));
        bps.push({ fn, id: r.breakpointId ?? null, error: r.error ?? null });
      }
    }
  }
  const ck = { fenced, logpoints: bps };
  if (drawn && fenced && bps.filter((b) => b.id).length === 2) {
    await bchips.filter({ hasText: 'q3.pdf' }).first().click({ timeout: 5000 }).catch(() => {});
    await until(async () => (calls.some((c) => c.startsWith('quickLook ')) ? true : null), 5000, 200);
    await bchips.filter({ hasText: 'data.csv' }).first().click({ button: 'right', timeout: 5000 }).catch(() => {});
    await until(async () => (calls.some((c) => c.startsWith('showInFinder ')) ? true : null), 5000, 200);
    const n0 = calls.length;
    await gone.click({ timeout: 5000 }).catch(() => {});
    await gone.click({ button: 'right', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    ck.calls = [...calls];
    ck.gone_calls = calls.length - n0;
  }
  for (const b of bps) if (b.id) await dbg.send('Debugger.removeBreakpoint', { breakpointId: b.id }).catch(() => {});
  if (dbg) { await dbg.send('Debugger.disable').catch(() => {}); await dbg.detach().catch(() => {}); }
  step('(f1) a click on a file chip calls quickLook(its path), a right-click showInFinder(its path), the gone one calls nothing (seen in the preload; main fences them out)',
    (ck.calls ?? []).includes(`quickLook ${at('q3.pdf')}`) && (ck.calls ?? []).includes(`showInFinder ${at('data.csv')}`) && ck.gone_calls === 0, ck);

  // a csv dropped while answering a card: harness' main asks, bise's inbox block docks it
  const csv = at('bench-zq.csv');
  fs.writeFileSync(csv, ['run,ms', 'cold,412', ''].join(NL));
  const Q = 'which bench zqbench?';
  await fresh(`[[bash: sb card '${Q}`);
  for (const l of ['1. cold', "2. warm']]"]) { await page.keyboard.press('Shift+Enter'); await page.keyboard.type(l, { delay: 5 }); }
  await page.keyboard.press('Enter');
  await click('bise', page.locator('[data-testid="app.sidebar.bise"]').first());
  const row = page.locator('[data-testid^="inbox.block.row."]', { hasText: 'zqbench' }).first();
  const card = page.locator('[data-testid^="inbox.block.card."]').filter({ hasText: 'zqbench' }).first();
  // the block draws its first items only: an item under '+ N more' is listed too (ambient-lead m_22076),
  // so each poll that sees no zqbench opens the next ones
  const listed = await until(async () => {
    if ((await row.isVisible().catch(() => false)) || (await card.isVisible().catch(() => false)) || /zqbench/.test(((await text('[data-testid="inbox.block"]')) ?? ''))) return true;
    await page.locator('[data-testid="inbox.block.more"]').first().click({ timeout: 1000 }).catch(() => {});
    return null;
  }, 90000, 1000);
  for (let i = 0; listed && i < 40 && !(await card.isVisible().catch(() => false)); i++) {
    if (await row.isVisible().catch(() => false)) await row.click({ timeout: 2000 }).catch(() => {});
    else await page.locator('[data-testid="inbox.block.more"]').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  const docked = await card.isVisible().catch(() => false);
  const answering = docked && /answering/.test(((await page.locator('[data-testid="composer"]').first().innerText({ timeout: 1000 }).catch(() => '')) ?? ''));
  let ans = { listed: !!listed, docked, answering };
  if (answering) {
    await fresh('cold, see ');
    await drop('[data-testid="composer.field"]:visible', [csv]);
    const chip = await until(async () => ((await fileChip.count()) === 1 && /bench-zq\.csv/.test(await fileChip.first().innerText().catch(() => '')) ? true : null), 8000, 300);
    await shot('file-chip-card-answer');
    await page.keyboard.press('Enter');
    // an answer reaches main as the hub's own words ('the user answered card #N (…): "…"'), the file
    // in them as its <file … path=…> tag where he dropped it (cand-2760), or as a file part
    const asPart = (r) => r.parts?.some((p) => p.kind === 'file' && p.path === csv);
    const asTag = (r) => /answered card/.test(r.text) && r.text.includes(`cold, see <file name="[File #1]" path="${csv}"`);
    const got = await until(async () => journal('bench-zq.csv').find((r) => asPart(r) || asTag(r)) ?? null, 30000, 1000);
    ans = { ...ans, chip: !!chip, entry: got ? { ...got, parts: got.parts?.map((p) => ({ kind: p.kind, name: p.name, path: p.path ? path.basename(p.path) : undefined, text: p.text })) ?? null } : journal('bench-zq.csv').slice(0, 2) };
    ans.ok = !!chip && !!got && (asTag(got) || (got.parts[0]?.kind === 'text' && /cold, see/.test(got.parts[0]?.text ?? '')));
  }
  step("(f1) a csv dropped while answering a card: a file chip, sent as a file part where it was", !!ans.ok, ans);
  await harness();
}

// the draft across a restart (ambient-lead m_19525): typed in harness' composer, never sent; after
// the restart the same composer must hold it again
if (mode === 'draft-type' || mode === 'draft-check') {
  await click('open harness', page.locator('[data-testid="app.sidebar"]').getByText('harness', { exact: true }).first());
  const composer = page.locator('[data-testid="composer"] [contenteditable="true"], [data-testid="composer"] textarea').first();
  await composer.waitFor({ timeout: 15000 }).catch(() => {});
  const holds = async () => ((await composer.innerText({ timeout: 2000 }).catch(() => '')) || (await composer.inputValue({ timeout: 500 }).catch(() => ''))).trim();
  // 516a4e79: the terminal panel left open across a restart starts its shell, never 'no folder for
  // this project' (it waits for the core's projects rows). Opened in the pause pass, read after it.
  const term = page.locator('[data-testid="terminal.panel"]').first();
  const termMark = path.join(out, 'term-open.json');
  if (mode === 'draft-type' && !tag.endsWith('atonce')) {
    if (!(await term.isVisible().catch(() => false))) await page.keyboard.press('Control+Backquote');
    const open = await term.waitFor({ timeout: 8000 }).then(() => true, () => false);
    const state = open ? await until(async () => { const s = await page.locator('[data-testid="terminal.screen"]').first().getAttribute('data-state').catch(() => null); return s && s !== 'opening' ? s : null; }, 10000, 300) : null;
    if (open) fs.writeFileSync(termMark, JSON.stringify({ state }));
    await shot('terminal-open-before-restart');
    step('the terminal panel is open before the restart (⌃`)', open, { state });
  }
  if (mode === 'draft-check' && fs.existsSync(termMark) && !tag.endsWith('atonce')) {
    const shown = await term.waitFor({ timeout: 15000 }).then(() => true, () => false);
    const state = shown ? await until(async () => { const s = await page.locator('[data-testid="terminal.screen"]').first().getAttribute('data-state').catch(() => null); return s && s !== 'opening' ? s : null; }, 20000, 300) : null;
    const failed = ((await text('[data-testid="terminal.failed"]')) ?? '').slice(0, 200);
    await shot('terminal-after-restart');
    step("the terminal panel kept open across the restart starts its shell (no 'no folder')", shown && state === 'live' && !/no folder/.test(failed), { shown, state, failed: failed || null });
  }
  if (mode === 'draft-type') {
    const typed = await click('the composer', composer);
    // the last pass's draft is still there (kept across its restart) and a click lands mid-text:
    // empty it first, so each pass holds exactly its own words (run 40fc444d merged two drafts)
    if (typed) {
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(draft, { delay: 15 });
    }
    await shot('draft');
    const now = await holds();
    step('the draft is in the composer, not sent', now === draft, now.slice(0, 300));
  } else {
    const back = await until(async () => ((await holds()) === draft ? draft : null), 20000, 500);
    await shot('draft-back');
    step('the draft is back in the composer after the restart', !!back, back ?? (await holds()).slice(0, 300));
    const kept = fs.existsSync(path.join(out, 'side-width.txt')) ? Number(fs.readFileSync(path.join(out, 'side-width.txt'), 'utf8')) : null;
    if (kept) {
      const w = Number(await page.locator('[data-testid="app.split.side"]').first().getAttribute('aria-valuenow').catch(() => null));
      step('the sidebar width is kept across the restart', w === kept, { kept, now: w });
    }
  }
}
ending = true;
await browser.close().catch(() => {});
