// The settings pages (desktop-app v9 "les réglages", the old window's
// winsetup.js settings, ported): general, voice and fn, context and
// privacy, quiet moments, models, projects, keys. Each one draws its part
// of SettingsData with the DS's Group rows and says what he changes.
// Owner: amb-home.
import { useEffect, useState, type ReactNode } from 'react';
import type { AppCmd, JsonValue, Plugin } from '@/proto';
import { Act, Button, Chip, Field, Group, Kbd, Seg, Toggle, type GroupItem } from '@/ds';
import { Accounts } from './accounts';
import { Roles } from './roles';
import { Approvals } from './approvals';
import { modelRow, needsSetup } from './hold';
import { Projects } from './projects';
import { Plugins } from './plugins';
import { Computer } from './computer';
import { checks, SetupCheck } from './check';
import { KEY_SECTIONS } from './keys';
import { appName, excludedApps, flag, knownApps, num, str, type Prefs } from './prefs';
import type { SettingsData, SettingsPorts } from './Settings';
import type { NotifyAuth } from '@/shared/api';

export type Page = 'setup' | 'general' | 'voice' | 'privacy' | 'quiet' | 'models' | 'approvals' | 'projects' | 'plugins' | 'computer' | 'keys';

export const PAGES: readonly { id: Page; title: string; sub: string }[] = [
  { id: 'general', title: 'general', sub: 'bise on your Mac.' },
  { id: 'setup', title: 'setup', sub: 'what bise needs, checked again. /setup in the terminal.' },
  { id: 'voice', title: 'voice and fn', sub: 'how you talk to bise.' },
  { id: 'privacy', title: 'context and privacy', sub: 'what fn adds to your question. nothing is read unless you hold fn.' },
  { id: 'quiet', title: 'quiet moments', sub: 'when cards wait, and how they come back.' },
  { id: 'models', title: 'models', sub: 'your subscription is enough; an API key works too. /models and /provider in the terminal.' },
  { id: 'approvals', title: 'approvals', sub: 'what runs without asking you. /approvals in the terminal.' },
  { id: 'projects', title: 'projects', sub: "one main per project; yours, bise, coordinates them. the order is ⌘1 … ⌘9's." },
  { id: 'plugins', title: 'plugins', sub: 'what your agents can use besides the repo: skills, tools, servers. /plugins in the terminal.' },
  { id: 'computer', title: 'computer use', sub: 'agents drive Chrome and your apps, step by step. /computer-use in the terminal.' },
  { id: 'keys', title: 'keys', sub: "every terminal key works here too; ⌘ adds a Mac app's gestures. /help in the terminal." },
];

/**
 * The general page's macOS notifications row (amb-mac m_14410, designer m_14211): what it says and the
 * one thing it does for each state. 'never' asks; 'asked' and 'off' only System Settings can change
 * (macOS asks once), so they open it; 'on' does nothing. null (no notify api, not known yet): no row. Pure.
 */
export function notifyRow(auth: NotifyAuth | null): { sub: string; act: 'ask' | 'open' | null; button: string } | null {
  switch (auth) {
    case null:
      return null;
    case 'never':
      return { sub: "questions can reach you when bise isn't in front", act: 'ask', button: 'turn on' };
    case 'asked':
      return { sub: 'macOS asked you; your answer is in System Settings', act: 'open', button: 'open System Settings' };
    case 'on':
      return { sub: "questions reach you when bise isn't in front", act: null, button: '' };
    case 'off':
      return { sub: 'off in macOS: questions wait in bise until you look', act: 'open', button: 'open System Settings' };
  }
}

/** A route's page (none, or one this version doesn't know: general). */
export function pageOf(id: string | undefined): (typeof PAGES)[number] {
  return PAGES.find((p) => p.id === id) ?? (PAGES[0] as (typeof PAGES)[number]);
}

interface PageProps {
  page: Page;
  prefs: Prefs | null;
  setPref: (key: string, value: JsonValue) => void;
  data: SettingsData;
  ports: SettingsPorts;
}

export function PageBody({ page, prefs, setPref, data, ports }: PageProps) {
  const tg = (key: string, label: string, sub: string, dflt = true): GroupItem => {
    const on = flag(prefs, key, dflt);
    return {
      id: key,
      label,
      sub,
      control: (
        <Toggle
          on={on}
          label={label}
          onChange={(v) => {
            setPref(key, v);
          }}
          testId={`settings.pref.${key}`}
        />
      ),
    };
  };
  switch (page) {
    case 'general': {
      const themes = ['system', 'light', 'dark'] as const;
      const theme = str(prefs, 'theme', 'system');
      const on = Math.max(0, themes.indexOf(theme === 'auto' ? 'system' : (theme as (typeof themes)[number])));
      return (
        <Group
          testId="settings.general"
          items={[
            {
              id: 'theme',
              label: 'appearance',
              sub: 'light, dark, or as macOS',
              control: (
                <Seg
                  items={themes}
                  on={on}
                  onPick={(i) => {
                    setPref('theme', themes[i] ?? 'system');
                  }}
                  testId="settings.pref.theme"
                />
              ),
            },
            ...notifyItems(data.notify ?? null, ports.notify),
          ]}
        />
      );
    }
    case 'voice': {
      const lang = str(prefs, 'voice.language', 'auto');
      const langs: readonly (readonly [string, string])[] = [
        ['auto', 'auto'],
        ['en', 'English'],
        ['fr', 'Français'],
      ];
      return (
        <Group
          testId="settings.voice"
          items={[
            tg('voice.fn_hold', 'hold fn to talk', 'your words go when you let go'),
            tg('voice.fn_twice', 'fn fn: hands-free', 'talk without holding; fn again stops'),
            {
              id: 'voice.language',
              label: 'what bise hears',
              sub: 'the language of your voice',
              control: (
                <Seg
                  items={langs.map(([, n]) => n)}
                  on={Math.max(0, langs.findIndex(([v]) => v === lang))}
                  onPick={(i) => {
                    setPref('voice.language', langs[i]?.[0] ?? 'auto');
                  }}
                  testId="settings.pref.voice.language"
                />
              ),
            },
          ]}
        />
      );
    }
    case 'privacy':
      return <Privacy prefs={prefs} setPref={setPref} tg={tg} />;
    case 'quiet': {
      const every = num(prefs, 'quiet.batch_min', 30);
      return (
        <>
          <Group
            title="cards wait"
            testId="settings.quiet"
            items={[
              tg('quiet.call', 'during a call', 'Zoom, Meet, FaceTime: the pearl blushes, nothing shows'),
              tg('quiet.share', 'while you share your screen', 'never a card during a share'),
              tg('quiet.fullscreen', 'in full screen', 'Keynote, a game, a video'),
              tg('quiet.focus', 'in focus mode', 'follows macOS focus'),
            ]}
          />
          <Group
            title="then"
            testId="settings.quiet.then"
            items={[
              tg('quiet.batch', 'they come together', '“2 questions · 1 min”, one at a time'),
              {
                id: 'quiet.batch_min',
                label: 'at most every',
                sub: 'to group the rest',
                control: (
                  <Seg
                    items={['10 min', '30 min', '60 min']}
                    on={Math.max(0, [10, 30, 60].indexOf(every))}
                    onPick={(i) => {
                      setPref('quiet.batch_min', [10, 30, 60][i] ?? 30);
                    }}
                    testId="settings.pref.quiet.batch_min"
                  />
                ),
              },
              tg('quiet.away_card', 'while you were away', 'one card when you open your Mac again'),
            ]}
          />
        </>
      );
    }
    case 'models':
      return <Models data={data} ports={ports} />;
    case 'approvals':
      return <Approvals approvals={data.approvals ?? null} send={ports.approvals ?? null} error={data.approvalsError ?? null} home={data.home ?? ''} />;
    case 'projects':
      return <Projects projects={data.projects} found={data.found} ports={ports} />;
    case 'setup':
      return (
        <SetupCheck
          list={checks(data.perms, data.accounts, data.projects, ports.perm !== undefined)}
          ports={{
            send: ports.send,
            ...(ports.perm ? { perm: ports.perm } : {}),
            models: () => {
              ports.go('models');
            },
          }}
        />
      );
    case 'plugins':
      return <PluginsPage items={data.plugins} send={ports.send} />;
    case 'computer':
      return <Computer cu={data.computerUse} send={ports.send} />;
    case 'keys':
      // N1: where his keys and sign-ins are kept heads the keys page (designer m_17435: found under keys)
      return (
        <>
          {data.keychain != null && <KeychainRow k={data.keychain} send={ports.send} />}
          <KeyList />
        </>
      );
  }
}

function notifyItems(auth: NotifyAuth | null, act: ((a: 'ask' | 'open') => void) | undefined): GroupItem[] {
  const row = notifyRow(auth);
  if (row === null) return [];
  const go = row.act;
  return [
    {
      id: 'notify',
      label: 'macOS notifications',
      sub: <span data-testid="settings.notify.sub">{row.sub}</span>,
      control:
        go === null ? (
          <Chip tone="ok" testId="settings.notify.on">
            on
          </Chip>
        ) : (
          // designer m_18736: nothing ghost in rows; 'turn on' (ask) is the row's own action, the
          // way to the system's settings an Act
          go === 'ask' ? (
            <Button kind="pri" onClick={() => { act?.(go); }} testId={`settings.notify.${go}`}>
              {row.button}
            </Button>
          ) : (
            <Act onClick={() => { act?.(go); }} testId={`settings.notify.${go}`}>
              {row.button}
            </Act>
          )
        ),
    },
  ];
}

function Privacy({ prefs, setPref, tg }: { prefs: Prefs | null; setPref: (key: string, value: JsonValue) => void; tg: (key: string, label: string, sub: string, dflt?: boolean) => GroupItem }) {
  const days = num(prefs, 'shots_keep_days', 7);
  const apps = excludedApps(prefs);
  const [adding, setAdding] = useState(false);
  const flip = (id: string) => {
    setPref('excluded_apps', apps.includes(id) ? apps.filter((a) => a !== id) : [...apps, id]);
  };
  return (
    <>
      <Group
        title="when you hold fn"
        testId="settings.privacy"
        items={[
          tg('context.shot', 'a screenshot of the window in front', 'never the whole screen'),
          tg('context.url', "the tab's URL and title", 'Chrome, Safari, Arc'),
          tg('context.file', 'the open file and your selection', 'VS Code, Cursor, Xcode, Zed'),
          tg('context.window_text', 'the text of the window', 'mails, docs, tickets: bise sees what you see'),
        ]}
      />
      <Group
        title="kept"
        testId="settings.privacy.kept"
        items={[
          {
            id: 'shots_keep_days',
            label: 'screenshots',
            sub: 'in the thread, then deleted',
            control: (
              <Seg
                items={['1 day', '7 days', '30 days']}
                on={Math.max(0, [1, 7, 30].indexOf(days))}
                onPick={(i) => {
                  setPref('shots_keep_days', [1, 7, 30][i] ?? 7);
                }}
                testId="settings.pref.shots_keep_days"
              />
            ),
          },
        ]}
      />
      <Group
        title="never sent to an agent"
        testId="settings.privacy.apps"
        help="fn reads nothing in these apps: no title, URL, file, selection, text or capture."
        items={[
          ...knownApps(prefs).map((id) => ({
            id,
            label: appName(prefs, id),
            sub: <span className="settings-app-id">{id}</span>,
            control: (
              <Toggle
                on={apps.includes(id)}
                label={appName(prefs, id)}
                onChange={() => {
                  flip(id);
                }}
                testId={`settings.app.${id}`}
              />
            ),
          })),
          {
            id: 'add',
            label: adding ? <AddApp onAdd={(id) => { flip(id); setAdding(false); }} onCancel={() => { setAdding(false); }} /> : 'another app',
            control: adding ? undefined : (
              <Button kind="ghost" onClick={() => { setAdding(true); }} testId="settings.app.add">
                add…
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

/** the plugins page asks the core for them each time it opens (bise's home's) */
function PluginsPage({ items, send }: { items: readonly Plugin[] | null; send: (cmd: AppCmd) => void }) {
  useEffect(() => {
    send({ cmd: 'plugins' });
  }, [send]);
  return <Plugins items={items} send={send} />;
}

/** a bundle id typed by hand (com.example.app), ⏎ adds it */
function AddApp({ onAdd, onCancel }: { onAdd: (id: string) => void; onCancel: () => void }) {
  return (
    <Field
      autoFocus
      placeholder="its bundle id (com.example.app), then ⏎"
      testId="settings.app.id"
      onKeyDown={(e) => {
        const v = e.currentTarget.value.trim();
        if (e.key === 'Enter' && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v)) {
          e.preventDefault();
          onAdd(v);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

/** bar 3.5: every key of the app */
export function KeyList(): ReactNode {
  return (
    <>
      {KEY_SECTIONS.map((s) => (
        <Group
          key={s.id}
          title={s.title}
          testId={`settings.keys.${s.id}`}
          items={s.rows.map((r) => ({
            id: r.keys,
            label: r.action,
            sub: r.tui === undefined ? undefined : `terminal: ${r.tui}`,
            control: <Kbd>{r.keys}</Kbd>,
          }))}
        />
      ))}
      <Chip>/help and /shortcuts in the terminal list the same keys</Chip>
    </>
  );
}

/**
 * settings · models: his accounts, then which model does what (bar V17). A role set to a model
 * whose provider has no key or sign-in yet waits for its setup here (bar L5): the accounts show
 * that provider's sign-in or open its key field, and the screen sends the held role_set once the
 * provider is signed in (hold.ts).
 */
function Models({ data, ports }: { data: SettingsData; ports: SettingsPorts }) {
  const models = data.models ?? [];
  const held = data.held ?? null;
  return (
    <>
      <Accounts
        accounts={data.accounts}
        send={ports.send}
        keyError={data.keyError ?? null}
        want={held !== null ? { provider: held.provider, providerName: held.providerName, model: held.model } : null}
        signin={data.signin ?? null}
        {...(ports.copy ? { copy: ports.copy } : {})}
        {...(ports.cancelSignIn ? { cancelSignIn: ports.cancelSignIn } : {})}
      />
      <Roles
        roles={data.roles ?? []}
        models={models}
        error={data.roleError ?? null}
        set={(cmd, model) => {
          const provider = model !== null ? needsSetup(model, models) : null;
          if (provider !== null && model !== null && ports.hold) {
            const row = modelRow(model, models);
            ports.hold({ provider, providerName: row?.provider ?? provider, model: row?.label ?? model, cmd });
          } else {
            ports.send(cmd);
          }
        }}
      />
    </>
  );
}

/**
 * N1 (the TUI's /keychain [on|off], designer m_17435's words): where his keys and sign-ins are kept,
 * the macOS keychain or files in ~/.bise. The switch moves them (AppCmd keychain, the core's thread);
 * while it runs the switch waits and says so; the move's lines (item names and counts) under it, a
 * failed one in the error tone.
 */
function KeychainRow({ k, send }: { k: NonNullable<SettingsData['keychain']>; send: (cmd: AppCmd) => void }) {
  const on = k.store === 'keychain';
  // a move's own lines are the core's (secrets_cli, the terminal's words); with none, where they are
  const said = k.moving ? 'moving them…' : (k.lines?.join(' ') ?? '');
  const now = on ? 'on: your keys and sign-ins are in the macOS keychain.' : "off: they're in files in ~/.bise. same switch as /keychain in the terminal.";
  return (
    <Group
      title="your keys and sign-ins"
      testId="settings.keychain"
      items={[
        {
          id: 'keychain',
          label: 'keep them in the macOS keychain',
          sub: (
            <span data-testid="settings.keychain.sub" className={k.failed === true && !k.moving ? 'settings-err' : undefined}>
              {said !== '' ? said : now}
            </span>
          ),
          control: (
            <Toggle
              on={on}
              state={k.moving ? 'disabled' : undefined}
              label="keep your keys and sign-ins in the macOS keychain"
              onChange={(v) => {
                send({ cmd: 'keychain', to: v ? 'on' : 'off' });
              }}
              testId="settings.keychain.toggle"
            />
          ),
        },
      ]}
    />
  );
}
