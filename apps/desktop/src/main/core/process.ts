// The core child: `<bise> ambient-core`, JSON-RPC 2.0, one object per
// line both ways (docs/ambient-app.md §4; client-protocol step 6,
// bise_proto::app_rpc): `initialize` at each start, 'up' once the core
// answered it (then `initialized`), each command a request (a refused one
// logged), each notification an event for the store. As the Swift app ran it (Core.swift): its
// stderr appended to a log file, restarted with a backoff when it exits,
// a write to a core that is down dropped with a log line (the store marks
// pending sends failed on `down`). Node only (no Electron), so its test
// drives a fake core script.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { childEnv } from '../childenv';
import { Backoff, coreArgs, type CoreConfig } from './env';
import { constants } from 'node:os';
import { crashLoop, earlyEnd, exitOf, failedToStart, reasonOf } from './exit';
import { INITIALIZED_LINE, initializeLine, LineSplitter, notAnEventLog, readLine, refusedLog, requestOf } from './lines';
import type { CoreExit, CoreState } from '../../shared/api';

/** At most this much of a run's stderr is read back from the log at its end. */
const TAIL = 16 * 1024;

export interface CoreHooks {
  /** a JSON object with a string `ev`, as the core wrote it */
  readonly onEvent: (ev: Record<string, unknown>) => void;
  readonly onState: (state: CoreState) => void;
  /** how a run ended (exit.ts): before the 'down' it causes; never at stop() */
  readonly onExit?: (exit: CoreExit) => void;
  /** a crash's report (report.ts), written before onExit: its path, or null (amb-mac, designer's 'show the report') */
  readonly report?: (exit: CoreExit, tail: string) => string | null;
  /** a log line of main (not the core's stderr, which goes to the log file) */
  readonly log: (line: string) => void;
  /** a request's result (not its error): the command as the window sent it, and what the core answered (A1) */
  readonly onAnswer?: (cmd: Readonly<Record<string, unknown>>, result: unknown) => void;
}

export interface CoreOptions {
  readonly config: CoreConfig;
  /** the core's stderr goes here (appended); none: ignored */
  readonly logFile?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** test mode: the core gets the test settings of main's env too (childenv.ts) */
  readonly test?: boolean;
  /** an off-screen run (offscreen.ts noAsks): the core gets --offscreen, never opens his mic */
  readonly offscreen?: boolean;
  /** the delay before a restart, in ms (tests shorten it) */
  readonly scale?: number;
  /** the app's version, said in initialize */
  readonly version?: string;
}

export class CoreProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stopped = true;
  private gen = 0;
  private startedAt = 0;
  /** the log's size when this run started: its own stderr comes after */
  private logFrom = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly backoff = new Backoff();
  private stateNow: CoreState = 'down';
  /** this run's next request id (0 is its initialize) and the requests waiting for their answer */
  private nextId = 1;
  private readonly waiting = new Map<number, { readonly method: string; readonly cmd: Readonly<Record<string, unknown>> }>();
  /** the crashes of the last 10 min (exit.ts crashLoop) */
  private crashTimes: number[] = [];
  /** the third crash in 10 min, or a second early end alike: no restart until 'start bise' (restart()) */
  private gaveUp = false;
  /** this run answered its initialize */
  private answered = false;
  /** the last line of the previous run when it ended before answering (exit.ts earlyEnd) */
  private earlyLast: string | null = null;

  constructor(
    private readonly opts: CoreOptions,
    private readonly hooks: CoreHooks,
  ) {}

  get state(): CoreState {
    return this.stateNow;
  }

  start(): void {
    this.stopped = false;
    this.launch();
  }

  /**
   * 'start bise' after it stopped restarting (designer): the crash count starts over. A no-op
   * while a core is up or starting or a restart is due (two clicks never start two; amb-core m_16798).
   */
  restart(): boolean {
    if (this.stopped || this.child !== null || this.timer !== null || this.stateNow !== 'down') return false;
    this.crashTimes = [];
    this.gaveUp = false;
    this.earlyLast = null;
    this.launch();
    return true;
  }

  /** How a run ended, with the crash count, whether it gives up, and the report written for a crash. */
  private ended(raw0: CoreExit, tail: string): CoreExit {
    // the same early end twice: 'failed', never a silent restart loop (architect m_18354)
    const early = earlyEnd(this.earlyLast, raw0, this.answered);
    this.earlyLast = early.last;
    if (early.giveUp) {
      this.gaveUp = true;
      const failed: CoreExit = { ...raw0, how: 'failed', crash: false };
      return { ...failed, reason: reasonOf(failed, constants.signals) };
    }
    const raw = raw0;
    const e: CoreExit = { ...raw, reason: reasonOf(raw, constants.signals) };
    if (!e.crash) return e;
    const loop = crashLoop(this.crashTimes, e.at_ms);
    this.crashTimes = loop.times;
    this.gaveUp = loop.stop;
    const counted: CoreExit = { ...e, crashes: loop.count, stopped: loop.stop };
    return { ...counted, report: this.hooks.report?.(counted, tail) ?? null };
  }

  /** Stops it for good (at quit): stdin closed, then SIGTERM. */
  stop(): void {
    this.stopped = true;
    this.gen += 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const c = this.child;
    this.child = null;
    if (c !== null) {
      c.stdin.end();
      c.kill('SIGTERM');
    }
    this.setState('down');
  }

  /** Writes one command as a request; false when refused (not a command) or the core is not up. */
  send(cmd: unknown): boolean {
    const c = this.child;
    const tag = (cmd as { cmd?: unknown } | null)?.cmd;
    if (c === null || this.stateNow !== 'up') {
      if (typeof tag === 'string') this.hooks.log(`core: down, dropped ${tag}`);
      else this.hooks.log('core: refused a command that is not an object with a string cmd');
      return false;
    }
    const id = this.nextId;
    const req = requestOf(id, cmd);
    if (req === null) {
      this.hooks.log('core: refused a command that is not an object with a string cmd');
      return false;
    }
    this.nextId += 1;
    this.waiting.set(id, { method: req.method, cmd: cmd as Readonly<Record<string, unknown>> });
    c.stdin.write(req.line);
    return true;
  }

  /** One line of this run's core. */
  private line(child: ChildProcessWithoutNullStreams, line: string): void {
    const l = readLine(line);
    if (l === null) {
      if (line.trim() !== '') this.hooks.log(notAnEventLog(line));
      return;
    }
    if (l.kind === 'event') {
      this.hooks.onEvent(l.ev);
      return;
    }
    if (l.id === 0) {
      if (l.error !== null) {
        this.hooks.log(refusedLog('initialize', l.error));
        return;
      }
      child.stdin.write(INITIALIZED_LINE);
      this.answered = true;
      this.setState('up');
      return;
    }
    const asked = l.id === null ? undefined : this.waiting.get(l.id);
    if (l.id !== null) this.waiting.delete(l.id);
    if (l.error !== null) this.hooks.log(refusedLog(asked?.method ?? 'a request', l.error));
    else if (asked !== undefined) this.hooks.onAnswer?.(asked.cmd, l.result);
  }

  private setState(s: CoreState): void {
    if (s === this.stateNow) return;
    this.stateNow = s;
    this.hooks.onState(s);
  }

  private launch(): void {
    if (this.stopped) return;
    const { config } = this.opts;
    this.gen += 1;
    const g = this.gen;
    this.startedAt = Date.now();
    this.answered = false;
    this.logFrom = this.logSize();
    let err: number | 'ignore' = 'ignore';
    if (this.opts.logFile !== undefined) {
      try {
        err = openSync(this.opts.logFile, 'a');
      } catch (e) {
        this.hooks.log(`core: can't open ${this.opts.logFile}: ${String(e)}`);
      }
    }
    this.setState('starting');
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(config.bise, coreArgs(config.workspace, this.opts.offscreen === true), {
        env: childEnv(this.opts.env ?? process.env, this.opts.test === true, this.opts.offscreen === true),
        ...(config.workspace === '' ? {} : { cwd: config.workspace }),
        stdio: ['pipe', 'pipe', err],
      }) as ChildProcessWithoutNullStreams;
    } catch (e) {
      this.hooks.log(`core: can't start ${config.bise}: ${String(e)}`);
      if (typeof err === 'number') closeSync(err);
      this.hooks.onExit?.(failedToStart(`can't start ${config.bise}: ${String(e)}`, Date.now()));
      this.exited(g);
      return;
    }
    if (typeof err === 'number') closeSync(err);
    this.child = child;
    this.nextId = 1;
    this.waiting.clear();
    const lines = new LineSplitter();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (g !== this.gen) return;
      for (const line of lines.feed(chunk)) this.line(child, line);
    });
    child.stdin.on('error', (e) => {
      this.hooks.log(`core: stdin: ${e.message}`);
    });
    child.on('spawn', () => {
      if (g !== this.gen) return;
      this.hooks.log(`core: started pid ${String(child.pid)} (${config.workspace || 'home'})`);
      // 'up' once it answers: nothing else goes before its initialize
      child.stdin.write(initializeLine(this.opts.version ?? ''));
    });
    child.on('error', (e) => {
      this.hooks.log(`core: ${e.message}`);
      if (g === this.gen && !this.stopped) this.hooks.onExit?.(this.ended(failedToStart(e.message, Date.now()), ''));
      this.exited(g);
    });
    child.on('exit', (code, signal) => {
      this.hooks.log(`core: exited ${String(code ?? signal)}`);
      if (g === this.gen && !this.stopped) {
        const tail = this.runTail();
        this.hooks.onExit?.(this.ended(exitOf(code, signal, tail, this.opts.logFile ?? null, Date.now()), tail));
      }
      this.exited(g);
    });
  }

  private logSize(): number {
    if (this.opts.logFile === undefined) return 0;
    try {
      return statSync(this.opts.logFile).size;
    } catch {
      return 0;
    }
  }

  /** What this run wrote to the log (its last TAIL bytes at most). */
  private runTail(): string {
    const file = this.opts.logFile;
    if (file === undefined) return '';
    try {
      const end = statSync(file).size;
      const from = Math.max(this.logFrom, end - TAIL);
      if (end <= from) return '';
      const fd = openSync(file, 'r');
      try {
        const buf = Buffer.alloc(end - from);
        readSync(fd, buf, 0, buf.length, from);
        return buf.toString('utf8');
      } finally {
        closeSync(fd);
      }
    } catch {
      return '';
    }
  }

  private exited(g: number): void {
    if (g !== this.gen) return;
    this.gen += 1;
    this.child = null;
    this.setState('down');
    if (this.stopped) return;
    // three crashes in 10 min: it stops trying, the window says so and offers 'start bise'
    if (this.gaveUp) {
      this.hooks.log('core: 3 crashes in 10 min, not restarting it');
      return;
    }
    const lived = (Date.now() - this.startedAt) / 1000;
    const wait = this.backoff.after(lived) * (this.opts.scale ?? 1000);
    this.hooks.log(`core: restart in ${String(wait)} ms`);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.launch();
    }, wait);
  }
}
