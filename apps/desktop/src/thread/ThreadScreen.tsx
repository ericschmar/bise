// One agent's thread: its head, its entries, its current step, ⌘F, and
// amb-web's composer. Owner: amb-win. Bar ⛔3 (a send shows at once),
// ⛔4 (readable answers), ⛔6 (ctrl+c stops the turn), 3.3 (writing to one
// agent: the composer's target is this agent), 3.4 (⌘F).
//
// What re-renders what (the reset's flicker rule): the list re-renders
// when its keys change (an entry or a send comes or goes); each row reads
// its own data; the composer is memo'd with stable props, so neither an
// entry, a step nor a send ever re-renders it.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Head, Marker } from '@/ds';
import type { ComposerActions } from '@/composer';
import type { Card } from '@/proto';
import { threadKey, useAgents, useApprovals, useModels, useCards, useCoreState, useProjects, useStore, useThreadOrder, useTyping } from '@/store';
import { usePartialText } from '@/shared/partial';
import { useMenuAction } from '@/app/menu';
import { useRouter } from '@/app/router';
import { MAIN } from '@/app/route';
import { RefusedLine } from '@/app/Refused';
import { keep } from '@/app/keep';
import { Tip } from '@/setup';
import { useTour } from '@/setup/useTour';
import { takeQuotes } from '@/review/quote';
import { QuotePop } from '@/quote/QuotePop';
import { Hint, hintUsed, hintsUserMessage, useHint } from '@/app/hints';
import { HubNoteRow, InboxBlock, type Answering } from '@/inbox';
import { dotOf, lineOf, shownName } from '@/agents/model';
import { Tune } from '@/agents/Tune';
import { AgentHead, BiseHead, StartingLine, WaitingLine } from './AgentHead';
import { LabelMark } from './LabelMark';
import { StepLine } from './live-step';
import { composerWords, dividerEnd, emptyEnter, nothingOwnYet, usageLine, workingRowShows } from './head';
import { waitAge, waitSince, waitsEvent } from './wake';
import { useNow } from '@/app/clock';
import { SignInLine, useThreadSignIn } from './signin';
import { type ThreadListHandle } from './ThreadList';
import { ComputerLine } from './ComputerLine';
import { entryKey } from './entry';
import { quoteSourcePos } from './quote';
import { QUOTE_SOURCE_EVENT } from '@/composer/pm/AttachList';
import { FindBar } from './FindBar';
import { BisePearl } from '@/app/BisePearl';
import { createFindMark, FindMarkContext } from './findmark';
import { trackRoutes, useHeld } from './routes';
import { OpenArtifactContext } from './openArtifact';
import { createFolds, FoldsContext } from './folds';
import { ThreadVoice, TYPING_END, typingLabelOf, useVoiceHere, VoiceTypePearl, VOICE_TYPING_KEYS } from '@/voicemode';
import { FirstRunSlot, Rows } from './ThreadRows';
import { useThreadQuote } from './threadQuote';
import { answerOf, HERE_BISE, ThreadComposer } from './ThreadComposer';

export interface ThreadScreenProps {
  project: string;
  agent: string;
  /** bise's own main: 'bise' with its pearl */
  bise?: boolean;
  /** the project's name for the head and the composer's 'you → …' */
  projectName?: string;
  /**
   * The artifact open beside this thread (designer's artifact-open page): its row is marked 'open',
   * the one composer is about it ('to perf · about “…”'), main's inbox is not on this screen.
   */
  artifact?: {
    id: string;
    title: string;
    url: string;
    to: string;
    placeholder: string;
    /**
     * whom the one composer writes to: the maker (this thread's agent), or the project's main when
     * the maker is archived (designer m_20453: its own thread stays in the centre, dim, '↺ restore'
     * in its head; only the composer goes to main)
     */
    agent?: string;
  };
}

export function ThreadScreen({ project, agent, bise = false, projectName, artifact }: ThreadScreenProps) {
  const store = useStore();
  const tkey = threadKey(project, agent);

  // the thread's pages and live entries while it is shown, asked again
  // when a restarted core comes up (a new core holds no subscription)
  const core = useCoreState();
  const live = core !== 'down';
  useEffect(() => {
    if (!live) return;
    store.subscribeThread(project, agent);
    return () => {
      store.unsubscribeThread(project, agent);
    };
  }, [store, project, agent, live]);

  // bise's routing holds of his sends here (read before the first send)
  trackRoutes(store);
  const held = useHeld(store, tkey);

  const me = useAgents(project).find((a) => a.name === agent);
  // S40/W3: the TUI's divider on the composer's label line: model · effort · approvals mode · state · context
  const approvals = useApprovals(project);
  const models = useModels(project);
  const now = useNow();
  // voice mode on this agent: its pane takes the composer's place (amb-home's src/voicemode)
  const voice = useVoiceHere(project, agent);
  const typing = useTyping(tkey);
  const busy = me?.status === 'working' || typing !== '';
  // an open artifact's block lists only its maker's own items (this thread's agent)
  const onlyMaker = useCallback((c: Card) => c.project === project && c.agent === agent, [project, agent]);

  // ⌘F's bar stays open across a reload (keep.ts: an open panel, no age); its folds too
  const findKey = `find.open:${project}/${agent}`;
  const [findOpen, setFindOpenState] = useState(() => keep.view(findKey) === true);
  const setFindOpen = useCallback(
    (on: boolean) => {
      setFindOpenState(on);
      keep.setView(findKey, on ? true : undefined);
    },
    [findKey],
  );
  const [mark] = useState(createFindMark);
  const [folds] = useState(() => createFolds(`${project}/${agent}`));
  const list = useRef<ThreadListHandle>(null);
  // a quote's row in the composer's attachment list: its words' entry here comes into view and flashes
  useEffect(() => {
    const go = (e: Event): void => {
      const { text } = (e as CustomEvent<{ from: string; text: string }>).detail;
      const pos = quoteSourcePos(store, tkey, text);
      if (pos === null) return;
      list.current?.scrollTo(entryKey(pos));
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-testid="thread.entry.${String(pos)}"]`);
        if (el === null) return;
        el.classList.remove('th-flash');
        el.getBoundingClientRect(); // a reflow: the flash runs again on a second click
        el.classList.add('th-flash');
      }, 120);
    };
    window.addEventListener(QUOTE_SOURCE_EVENT, go);
    return () => {
      window.removeEventListener(QUOTE_SOURCE_EVENT, go);
    };
  }, [store, tkey]);
  // H10 (designer m_19835): scrolled up to read, the inbox block is one line and the composer's keys line hides
  const [reading, setReading] = useState(false);
  // his bug 3: a selection in the thread, then a key, quotes it in the composer
  const section = useRef<HTMLElement>(null);
  const composer = useRef<ComposerActions | null>(null);
  // his queued message taken back to edit (QueuedRow): its words at the composer's caret, for him to resend
  const takeBack = useCallback((text: string) => {
    composer.current?.insertText(text);
    composer.current?.focusEnd();
  }, []);
  const onComposer = useCallback(
    (a: ComposerActions) => {
      composer.current = a;
      // V7: lines quoted in the review come in as chips, then the key he typed
      const q = takeQuotes(project, agent);
      if (q === null) return;
      // after the composer's own listeners are up (its strip reads the chips on an update)
      setTimeout(() => {
        for (const x of q.quotes) a.quote(x.text, q.from, x.at);
        a.insertText(q.key);
      }, 0);
    },
    [project, agent],
  );
  const quote = useThreadQuote(section, composer, agent);
  const quoting = quote.quoting;
  // L25: the demo's tips; 'inside' and 'end' sit at the thread's top, his send moves the tour
  const tour = useTour(project);
  const tourSent = useRef(tour.sent);
  useEffect(() => {
    tourSent.current = tour.sent;
  }, [tour.sent]);
  const onSent = useCallback(() => {
    tourSent.current();
    // S36: his message puts the one-time hints away
    hintsUserMessage();
  }, []);
  const topTip = (tour.tip === 'inside' && tour.snap.focus === agent) || tour.tip === 'end' ? tour.tip : null;
  useMenuAction('find', () => {
    setFindOpen(true);
  });
  // the window's keys (app/keys.ts): ⌘E everything folded, ⌘. stop,
  // end back to the bottom, ctrl+y copy a code block
  useMenuAction('fold-all', () => {
    // the row at the top of the view keeps its y while everything opens or closes (designer m_17092)
    list.current?.holdView();
    folds.toggle();
  });
  useMenuAction('to-end', () => {
    list.current?.scrollToEnd();
  });
  useMenuAction('copy-code', () => {
    const code = codeToCopy(document);
    if (code !== undefined) void (window as Partial<Window>).bise?.copy(code);
  });

  // ⛔6: a stop he asked, shown until the turn's end or a new entry
  const [stopping, setStopping] = useState(false);
  const stop = useCallback(() => {
    store.stop(project, agent);
    setStopping(true);
  }, [store, project, agent]);
  if (stopping && !busy) setStopping(false);
  useMenuAction('stop', () => {
    if (busy) stop();
  });

  /**
   * The thread's esc, once no list or popup took it (R18, the TUI's order): while bise holds his
   * words, keep them with bise (route_cancel). It never stops a turn: ctrl+c does, as the TUI's
   * (his ask main m_22205; rust/tui/src/sb/keys.rs:104). The composer calls it itself (ProseMirror
   * preventDefaults every Escape); an esc from elsewhere bubbles here.
   */
  // memo'd: the composer is (a new entry never re-renders it)
  const escape = useCallback((): boolean => {
    if (findOpen) return false;
    if (held === undefined) return false;
    store.command({ cmd: 'route_cancel', project: held.home, rid: held.rid });
    return true;
  }, [findOpen, held, store]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      if (escape()) e.preventDefault();
    } else if (e.key === 'c' && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.defaultPrevented) {
      // the TUI's ctrl+c (rust/tui/src/sb/keys.rs:104, his ask main m_22205): the one key that stops
      // the turn; copy is ⌘C on the Mac, so ctrl+c is free, but with text selected it does nothing
      // (he may be copying by habit)
      if (busy && (window.getSelection()?.isCollapsed ?? true)) {
        e.preventDefault();
        stop();
      }
    } else if (e.key === 'f' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault();
      setFindOpen(true);
    }
  };

  const [tuning, setTuning] = useState(false);
  // a project's main is bise (ambient m_11437): 'bise · acme', the project dim
  const title = bise || agent !== 'main' ? shownName(bise ? 'main' : agent) : 'bise';
  const headTitle =
    agent === 'main' && !bise ? (
      <>
        bise
        <span className="th-title-project" data-testid="thread.title.project">
          {' · '}
          {projectName ?? project}
        </span>
      </>
    ) : (
      title
    );
  // b1/b2 (his card #476): the inbox block over the composer tells what his words do while one of
  // its items is open in place: a question's answer ('answering perf · …'), or a plain message
  // with what an approval waits for; esc folds the item and his words are a message again
  const [answering, setAnswering] = useState<Answering | null>(null);
  // R15: an expired sign-in stopped this agent and his browser is on it: c on the empty composer
  // copies the link, esc cancels (the TUI's resign.rs keys)
  const cardsHere = useCards(project);
  const signIn = useThreadSignIn(emptyEnter(cardsHere, agent) !== null);
  const onKeyDownCapture = (e: KeyboardEvent) => {
    const field = e.target instanceof HTMLElement ? e.target.closest('[data-testid="composer.field"]') : null;
    if (signIn.on && field !== null && field.textContent.trim() === '' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'Escape' || e.key === 'c') {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'c') signIn.copy();
        else signIn.cancel();
        return;
      }
    }
  };
  // a project's main: its counts (tui-parity W2), else the agent's line
  const all = useAgents(project);
  const counts = agent === 'main' ? countsOf(all) : '';
  const router = useRouter();
  // the counts open the agents list (bar A.2: the TUI's /agents and panel)
  const countsLink =
    counts === '' ? null : (
      <a
        href="#agents"
        className="th-agents-link"
        onClick={(e) => {
          e.preventDefault();
          router.go({ screen: 'agents', project });
        }}
        data-testid="thread.agents"
      >
        {counts}
      </a>
    );
  const lead = bise ? 'every project' : agent === 'main' ? '' : (projectName ?? project);
  // its context gauge, named ('context 42k · 17%'), none while it says nothing ('0%': designer D7b)
  const gauge = bise ? '' : usageLine(me?.usage?.words);
  const sub = (
    <>
      {/* bise's own head: 'every project' alone (designer D7b) */}
      {bise ? (
        lead
      ) : agent === 'main' && countsLink !== null ? (
        lead === '' ? (
          countsLink
        ) : (
          <>
            {lead} · {countsLink}
          </>
        )
      ) : (
        [lead, agent !== 'main' && me ? lineOf(me) : ''].filter(Boolean).join(' · ')
      )}
      {gauge !== '' && (
        <span className="th-gauge" data-testid="thread.usage">
          {' · '}
          {gauge}
        </span>
      )}
      {/* voice mode on this agent (ambient's spec m_11632, amb-home m_11684) */}
      {voice !== 'off' && (
        <span className="th-voice" data-testid="thread.voice">
          {' · voice mode'}
        </span>
      )}
    </>
  );

  // designer's v6 (5): an agent whose thread has nothing of its own yet (his first message at most) is starting
  const order = useThreadOrder(tkey);
  // once it writes (a streamed reply, live.ts) it isn't starting any more, even between the
  // partial's clear and its entry (sticky for this thread: the line never comes back mid-turn)
  const writing = usePartialText(project, agent) !== null;
  const [wrote, setWrote] = useState<string | null>(null);
  if (writing && wrote !== tkey) setWrote(tkey);
  const fresh = !bise && agent !== MAIN && me !== undefined && !me.archived && order.loaded && nothingOwnYet(order.order.map((pos) => store.entry(tkey, pos)?.kind)) && me.status === 'working' && me.waits === 0 && !writing && wrote !== tkey;
  // the working row at the thread's end says 'working' and its age: the label drops its state then
  // (designer m_20262 (1): one place only; the head chip keeps it)
  const rowSays = !fresh && workingRowShows(me);
  // the gust beside 'to bise' (designer's desktop-working v2): the composer's addressee's, kept
  // stable so the memoised composer doesn't draw again for it (the mark reads its agent itself)
  const markAgent = artifact?.agent ?? agent;
  const markName = markAgent === agent ? title : markAgent;
  const startingMark = fresh && markAgent === agent;
  const labelMark = useMemo(
    () => <LabelMark project={project} agent={markAgent} name={markName} starting={startingMark} />,
    [project, markAgent, markName, startingMark],
  );
  const divider =
    me === undefined
      ? ''
      : dividerEnd({
          model: me.model,
          modelLabel: models.find((m) => m.id === me.model)?.label,
          effort: me.effort,
          mode: approvals?.mode,
          // event-wake (designer m_17827): while it waits for an event the label follows the head
          // ('… waiting · 2m'), never 'idle', the word he misread
          status: rowSays ? null : waitsEvent(me) ? `… waiting · ${waitAge(now - (waitSince(me.watching) ?? now))}` : me.status,
          // named like the head's gauge ('context 42k · 17%'), none at 0% (designer m_14523: a bare
          // '15 · 0%' read as nothing)
          context: usageLine(me.usage?.words),
        });
  // designer's desktop-screens v6 (1): '⋯' at the head's right (rename, model, reasoning)
  const more =
    me && !me.archived && !bise ? (
      <Button
        kind="ghost"
        title={me.main ? 'model, reasoning' : 'rename, model, reasoning'}
        onClick={() => {
          setTuning((x) => !x);
        }}
        testId="thread.more"
      >
        ⋯
      </Button>
    ) : undefined;
  return (
    <FoldsContext value={folds}>
    <FindMarkContext value={mark}>
    <OpenArtifactContext value={artifact?.id}>
      <section ref={section} className="th-screen" data-testid="thread.screen" data-project={project} data-agent={agent} data-quoting={quoting} data-answering={answering !== null} data-reading={reading} data-about={artifact !== undefined || undefined} data-dim={(artifact !== undefined && me?.archived === true) || undefined} onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture}>
        {artifact !== undefined && me?.archived === true && agent !== MAIN ? (
          <AgentHead project={project} a={me} restore={() => {
              // '↺ restore' in an archived maker's head, beside its artifact (designer m_20453)
              store.command({ cmd: 'unarchive', project, agent });
            }}
          />
        ) : bise || !me || me.archived ? (
          <Head
            title={headTitle}
            sub={sub}
            lead={bise ? <BisePearl size={14} /> : undefined}
            dot={bise || !me ? undefined : dotOf(me.status)}
          />
        ) : agent === MAIN ? (
          <BiseHead project={project} name={projectName ?? project} more={more} />
        ) : (
          <AgentHead project={project} a={me} more={more} note={voice !== 'off' ? 'voice mode' : undefined} starting={fresh} />
        )}
        {/* S29/L19 W1: it drives his computer: one line under the head, from computer_live only */}
        {!bise && <ComputerLine project={project} agent={agent} />}
        {tuning && me && !me.archived && (
          <Tune
            key={me.name}
            project={project}
            a={me}
            onRenamed={(to) => {
              setTuning(false);
              // the thread follows its new name
              router.go({ screen: 'thread', project, agent: to });
            }}
          />
        )}
        {findOpen && (
          <FindBar
            tkey={tkey}
            project={project}
            agent={agent}
            mark={mark}
            onGo={(pos) => list.current?.scrollTo(entryKey(pos))}
            onClose={() => {
              setFindOpen(false);
            }}
          />
        )}
        {topTip !== null && (
          <div className="th-tip">
            <Tip tip={topTip} snap={tour.snap} />
          </div>
        )}
        {/* the list and, over an empty one, the first-run block centred in the column (his try:
            it sat bottom-left at the column's edge) */}
        <div className="th-main">
          <Rows tkey={tkey} project={project} agent={agent} bise={bise} listRef={list} onTakeBack={takeBack} onReading={setReading} />
          {agent === MAIN && me?.archived !== true && <FirstRunSlot tkey={tkey} project={project} composer={composer} bise={bise} />}
        </div>
        {/* in the thread's column like the lines under it (amb-web m_17316: it sat flush left) */}
        {stopping && (
          <div className="th-stopping" data-testid="thread.stopping">
            <Marker>stopping {agent}…</Marker>
          </div>
        )}
        {fresh && <StartingLine a={me} />}
        {/* event-wake's '… waiting for …' row; working, only the gust beside the label says it
            (designer's desktop-working v2, his m_21668: the working row went) */}
        {!fresh && <WaitingLine a={me} />}
        {/* a typed command's result (the hub's plain line): one quiet row, never under the composer (amb-home) */}
        <HubNoteRow project={project} />
        {signIn.on && <SignInLine copied={signIn.copied} />}
        {/* the step at work, once: the growing fold '▸ <its words>  ∿ 10 s' (live-step.tsx) */}
        <StepLine tkey={tkey} project={project} agent={agent} working={workingRowShows(me)} typing={typing} />
        {/* W7/K24: the project's open items over the composer's divider (amb-home f44d082e) */}
        {/* its hub refused this core: the hub's words and a retry, over the composer (lead m_11347) */}
        <RefusedLine project={project} name={bise ? 'bise' : (projectName ?? project)} className="app-refused th-refused" testId="thread.refused" />
        <CardHint project={project} />
        {/* b1/b2: every project's open items, one opened in place (amb-home's InboxBlock, eb3da983) */}
        {artifact === undefined ? (
          <InboxBlock here={bise ? HERE_BISE : { project, agent }} onAnswer={setAnswering} />
        ) : (
          // beside an open artifact: only the maker's own question, docked over its one composer
          // (designer's artifact-open (g)); main's inbox is not on this screen
          <InboxBlock here={{ project, agent: artifact.agent ?? agent }} only={onlyMaker} onAnswer={setAnswering} />
        )}
        {me?.archived === true && artifact === undefined ? (
          <History project={project} agent={agent} />
        ) : voice === 'pane' ? (
          <ThreadVoice project={project} agent={agent} />
        ) : (
          <>
          {voice === 'typing' && <ThreadVoice project={project} agent={agent} />}
          <ThreadComposer
            project={project}
            agent={artifact?.agent ?? agent}
            busy={busy}
            // an open item: the block's words (a question's 'answering perf · …', or an approval's
            // 'to bise · the merge waits for 1 or 2' where his words stay a plain message, ambient m_8773);
            // voice mode while he types: 'to perf · voice paused', 'tab back to voice' (designer's voice-window (1))
            to={voice === 'typing' ? typingLabelOf(agent) : answering !== null ? answering.label : artifact !== undefined ? artifact.to : composerWords(title).label}
            toEnd={voice === 'typing' ? TYPING_END : (answering?.end ?? (divider === '' ? undefined : divider))}
            keys={voice === 'typing' ? VOICE_TYPING_KEYS : undefined}
            lead={voice === 'typing' ? <VoiceTypePearl /> : undefined}
            mark={labelMark}
            placeholder={answering?.answer != null ? 'your answer, then ⏎' : artifact !== undefined ? artifact.placeholder : composerWords(title).placeholder}
            {...(artifact === undefined ? {} : { about: { id: artifact.id, title: artifact.title, url: artifact.url } })}
            answer={answerOf(answering)}
            onStop={stop}
            onEscape={escape}
            quoting={quoting}
            onReady={onComposer}
            onSent={onSent}
          />
          </>
        )}
        {quote.pop !== null && (
          <span className="q-float" style={{ left: quote.pop.x, top: quote.pop.y }}>
            <QuotePop testId="thread.quote.pop" onAsk={quote.ask} onCopy={quote.copy} />
          </span>
        )}
      </section>
    </OpenArtifactContext>
    </FindMarkContext>
    </FoldsContext>
  );
}

/**
 * ctrl+y's block (the TUI's codeblock.rs): the code block under the mouse,
 * else the newest one drawn in the thread. Its text, as written.
 */
export function codeToCopy(doc: Document): string | undefined {
  const hovered = doc.querySelector('.th-list pre:hover code, .th-list pre:hover');
  if (hovered !== null) return hovered.textContent;
  const all = doc.querySelectorAll('.th-list pre code');
  const last = all.item(all.length - 1) as Element | null;
  return last === null ? undefined : last.textContent;
}

/** The list: entries by pos, then his sends not confirmed yet. */
/** "3 agents · 1 at work · 2 waiting": a project's live agents (main out). Pure. */
export function countsOf(agents: readonly { main: boolean; archived: boolean; status: string; waits: number }[]): string {
  const live = agents.filter((a) => !a.main && !a.archived);
  if (live.length === 0) return '';
  const work = live.filter((a) => a.status === 'working').length;
  const waits = agents.reduce((n, a) => n + a.waits, 0);
  return [`${String(live.length)} ${live.length === 1 ? 'agent' : 'agents'}`, work > 0 ? `${String(work)} at work` : '', waits > 0 ? `${String(waits)} waiting for you` : ''].filter(Boolean).join(' · ');
}

/** An archived agent's thread is history only (tui-parity C47): no composer, a way to restore it. */
function History({ project, agent }: { project: string; agent: string }) {
  const store = useStore();
  return (
    <div className="th-history" data-testid="thread.archived">
      {/* designer's ⌘K screen (amb-win m_11920): '<name> is archived · ⌘⏎ restore' */}
      <span>{agent} is archived ·</span>
      <Button
        kind="ghost"
        onClick={() => {
          store.command({ cmd: 'unarchive', project, agent });
        }}
        testId="thread.restore"
      >
        <kbd>⌘⏎</kbd> restore
      </Button>
    </div>
  );
}

/**
 * S36: the first card's one-time hint, over the thread's inbox strip; it goes when the
 * project has no open card any more (answered, closed) or after his next message.
 */
function CardHint({ project }: { project: string }) {
  const n = useProjects().find((p) => p.project === project)?.cards?.length ?? 0;
  const on = useHint('first_card', n > 0);
  useEffect(() => {
    if (n === 0) hintUsed('first_card');
  }, [n]);
  return on ? (
    <div className="th-hint">
      <Hint name="first_card" />
    </div>
  ) : null;
}
