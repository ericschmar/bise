// Electron's main process, minimal: one window on the renderer, the preload as
// its only bridge. Owner: amb-mac (windows, panel, tray, menus, helper);
// src/main/core (spawning `bise ambient-core`) is amb-core's.
//
// Test mode (BISE_DESKTOP_TEST=1), for the harness: nothing ever in his face.
// The page renders offscreen (webPreferences.offscreen) in a window that is
// never shown (also placed at -30000 and not focusable: a shown window there
// is clamped back onto his display), the app is an accessory with no
// Dock icon, userData is BISE_DESKTOP_USER_DATA or a temp folder (never his
// Application Support), and main prints READY_LINE on stdout once the page
// has loaded.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session } from 'electron';
import { BADGE_LINE, CORE_IPC, IPC, TEST_ENV, TEST_USER_DATA_ENV } from '../shared/api';
import { Capsule, installCapsuleIpc } from './capsule';
import { capsuleFramesDir } from './capsuleframe';
import { badgeOf, CountKeeper, titleOf } from './counts';
import { installGuard } from './guard';
import { startHelper } from './helper/run';
import { adoptLoginEnv } from './loginenv';
import { appName } from './appname';
import { onCoreEvent, sendToCore, startCore, stopCore } from './core/ipc';
import { configOfPrefs } from './helper/config';
import { Shots } from './helper/shot';
import { installIpc, sendClip, sendMenu, setProjectRoots } from './ipc';
import { installKeepIpc } from './keep';
import { projectRoots } from './reveal';
import { hasTestNotify, menuTemplate } from './menu';
import { startTerms, type TermHost } from './term/host';
import { startTray } from './tray';
import { testHomeProblem } from './testhome';
import { standInPaths } from './userdata';
import { themeSourceOf } from './theme';
import { takeRoute, Updates, updateTarget } from './update/run';
import { MainWindow } from './windows';
import { fenceOffscreen, isOffscreen, noAsks, OFFSCREEN_DISABLED_BLINK, OFFSCREEN_DISABLED_FEATURES, offscreenActivation } from './offscreen';
import { Notifier } from './notify/run';
import { langOf } from './notify/plan';

const testMode = process.env[TEST_ENV] === '1';
// amb-tools' as-he-does runs: every window off his screen, nothing else changes (offscreen.ts)
const offscreen = isOffscreen(process.env, testMode);
if (offscreen) {
  app.on('browser-window-created', (_e, win) => {
    fenceOffscreen(win);
  });
  // never the front app, from the first line (amb-tools m_18713): no Dock icon, and if anything
  // still activates it, it hides at once and his app is in front again
  // no system key listener (media keys): no Input Monitoring check at launch (offscreen.ts)
  app.commandLine.appendSwitch('disable-features', OFFSCREEN_DISABLED_FEATURES);
  // no page API that opens HID-class devices (keyboards are Input Monitoring's)
  app.commandLine.appendSwitch('disable-blink-features', OFFSCREEN_DISABLED_BLINK);
  if (offscreenActivation(offscreen, process.platform) !== null) {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
    app.on('did-become-active', () => {
      app.hide();
    });
  }
}

// a test run starts only in the throwaway home its harness made (testhome.ts):
// else it says why and stops here, before any window, helper or core (main
// m_9883: a run with his real HOME started his real global hub)
if (testMode) {
  const problem = testHomeProblem(process.env, userInfo().homedir);
  if (problem !== null) {
    process.stderr.write(`bise-desktop: test mode refused: ${problem}\n`);
    process.exit(3);
  }
  // every bise this run starts (the core, the hubs it starts) is jailed in it
  // too: bise_home's test_home::jail refuses any path outside BISE_TEST_HOME
  process.env['BISE_TEST_HOME'] ??= process.env['HOME'];
}

// the menu bar says 'bise' (Quit bise, Hide bise, About bise), never the
// package's name 'bise-desktop' (qa-native m_9724, lead m_12625): a packed
// app takes its bundle's own name (productName: 'bise', or a try build's), which
// also names its userData folder, so a try never shares his app's (appname.ts)
app.setName(appName(app.isPackaged, process.platform, process.execPath));

// a stand-in (another HOME, or a bise home that isn't his ~/.bise): the app's
// folders go under it, never his real Library (userdata.ts, m_18637)
const standIn = testMode ? null : standInPaths(process.env, userInfo().homedir, app.getName());
if (standIn !== null) {
  app.setPath('userData', standIn.userData);
  app.setPath('sessionData', standIn.sessionData);
  app.setPath('crashDumps', standIn.crashDumps);
  app.setPath('logs', standIn.logs);
  app.setPath('temp', standIn.temp);
}

if (testMode) {
  // never his ~/Library/Application Support: the harness's folder, else a fresh temp one
  const userData = process.env[TEST_USER_DATA_ENV] ?? mkdtempSync(join(tmpdir(), 'bise-desktop-test-'));
  app.setPath('userData', userData);
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
}

// every page guarded from birth: no new window, no navigation away (guard.ts)
installGuard(
  {
    file: pathToFileURL(join(__dirname, '../renderer/index.html')).href,
    ...(!app.isPackaged && process.env['ELECTRON_RENDERER_URL'] ? { dev: process.env['ELECTRON_RENDERER_URL'] } : {}),
  },
  testMode,
);

// the terminal panel's shells (term/host.ts), ended at quit
let terms: TermHost | null = null;

// his login shell's environment (loginenv.ts), asked now; the core and the
// shells wait for it, the window never does (never in a test run)
const loginEnv = adoptLoginEnv(process.platform, testMode);

void app.whenReady().then(() => {
  installIpc(testMode);
  // what he typed or opened, on disk for a reload, a relaunch or a crash (src/main/keep.ts)
  installKeepIpc(app.getPath('userData'));
  const helper = startHelper(testMode);
  // his prefs (excluded apps...) reach the helper now and on every change
  if (helper !== null) {
    // the fn talk's still of the front window, handed to the core (helper/shot.ts)
    const shots = new Shots({
      helper: (c) => {
        helper.send(c);
      },
      core: sendToCore,
      drop: (p) => {
        rmSync(p, { force: true });
      },
      dir: join(app.getPath('userData'), 'shots'),
    });
    helper.on((ev) => {
      shots.helperEv(ev);
    });
    onCoreEvent((ev) => {
      if (ev['ev'] !== 'prefs') return;
      helper.config(configOfPrefs(ev['prefs']));
      shots.prefsChanged(ev['prefs']);
    });
  }
  // his project folders: where quickLook / showInFinder may look (reveal.ts)
  onCoreEvent((ev) => {
    const r = projectRoots(ev);
    if (r !== null) setProjectRoots(r);
  });
  // his theme for the glass, the frames and the menus (theme.ts): the system's until his prefs come
  nativeTheme.themeSource = 'system';
  onCoreEvent((ev) => {
    if (ev['ev'] === 'prefs') nativeTheme.themeSource = themeSourceOf(ev['prefs']);
  });
  // the shells' IPC now; their first spawn waits for his login env
  terms = startTerms(testMode, loginEnv);
  // the core waits for his login env (a slow ~/.zshrc), the window doesn't
  // (architect m_10436): until it starts, the window hears an empty snapshot
  // and 'starting' (its 'connecting to bise…'), then the core's own handlers
  ipcMain.handle(CORE_IPC.stateNow, () => 'starting');
  ipcMain.handle(CORE_IPC.snapshot, () => []);
  void loginEnv.then(() => {
    ipcMain.removeHandler(CORE_IPC.stateNow);
    ipcMain.removeHandler(CORE_IPC.snapshot);
    startCore();
  });
  // the notifier comes after the windows; Help's test item reaches it once it exists
  let notifierRef: Notifier | null = null;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        platform: process.platform,
        appName: app.name,
        dev: !app.isPackaged,
        send: (action) => {
          sendMenu(action, main);
        },
        ...(testMode ? { clip: sendClip } : {}),
        // a0: try and check builds (their own name) and tests, never his release app
        ...(hasTestNotify(app.name, testMode)
          ? {
              testNotify: () => {
                notifierRef?.testNotify(join(app.getPath('userData'), 'notify-test.log'));
              },
            }
          : {}),
      }),
    ),
  );
  // its frame kept in userData (windows.ts FRAMES_FILE): a test's or a stand-in's, never his under a test
  const main = new MainWindow(testMode, offscreen, app.getPath('userData'));
  // off-screen: where the capsule would sit, in userData/capsule-frames.jsonl (capsuleframe.ts)
  const capsule = new Capsule(testMode, offscreen, capsuleFramesDir(offscreen, testMode, app.getPath('userData')));
  installCapsuleIpc(capsule);
  ipcMain.on(IPC.quit, () => {
    app.quit();
  });
  ipcMain.on(IPC.openWindow, (_e, route: unknown) => {
    main.open(typeof route === 'string' ? route : undefined);
  });
  if (!testMode) startTray(capsule, main);
  // his questions as macOS notifications when no bise window has the keys (notify/, card #476)
  const notifier = new Notifier({
    testMode,
    quiet: noAsks(process.env, testMode),
    lang: langOf(app.getPreferredSystemLanguages()),
    send: sendToCore,
    open: (route) => {
      main.open(route);
    },
    dir: app.getPath('userData'),
    broadcast: (s) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.notifyState, s);
    },
  });
  notifierRef = notifier;
  // a quiet moment (a call, screen sharing, full screen): a question still arrives, silent
  helper?.on((ev) => {
    if (ev.ev === 'quiet') notifier.setQuiet(ev.on);
  });
  ipcMain.handle(IPC.notifyState, () => notifier.auth());
  ipcMain.handle(IPC.notifyAsk, () => notifier.ask());
  ipcMain.on(IPC.notifySettings, () => {
    notifier.openSettings();
  });
  onCoreEvent((ev) => {
    notifier.onCoreEvent(ev);
  });
  // the counts outside the app (counts.ts): the Dock's badge, the window's title
  const counts = new CountKeeper();
  onCoreEvent((ev) => {
    const c = counts.apply(ev);
    if (c === null) return;
    main.setTitle(titleOf(c));
    // test mode has no Dock icon: the badge is a stdout line the harness reads
    if (testMode) process.stdout.write(`${BADGE_LINE} ${JSON.stringify(badgeOf(c))}
`);
    else app.dock?.setBadge(badgeOf(c));
  });
  // the app's own update (update/run.ts, bar S.6): only a packed app (or a
  // test's fake bundle in its test home) updates itself, on his click
  const updatesDir = join(app.getPath('userData'), 'updates');
  const target = updateTarget(testMode, process.env, app.isPackaged, process.execPath);
  const updates =
    target === null
      ? null
      : new Updates(target, updatesDir, {
          testMode,
          send: sendToCore,
          stopCore,
          broadcast: (s) => {
            for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.updateState, s);
          },
        });
  ipcMain.handle(IPC.updateNow, () => updates?.now() ?? { state: 'none' });
  ipcMain.handle(IPC.updateInstall, (_e, route: unknown) => updates?.install(typeof route === 'string' ? route : null) ?? false);
  ipcMain.handle(IPC.updateRevert, () => updates?.revert() ?? false);
  if (updates !== null) {
    void updates.start().then(() => {
      onCoreEvent((ev) => {
        updates.onCoreEvent(ev);
      });
    });
  }
  // after a swap, the screen he was on (written at his click)
  main.create(target === null ? undefined : takeRoute(updatesDir));
  app.on('activate', () => {
    main.open();
  });
});

app.on('will-quit', () => {
  // the composer's history and the panels' own bits still live in localStorage: on disk before
  // the app goes (Chromium writes it lazily; the keep itself is a file, src/main/keep.ts)
  session.defaultSession.flushStorageData();
  terms?.stopAll();
  stopCore();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || testMode) app.quit();
});
