# hub/main.bend — sb-core: the Switchboard hub's decisions as a process.
#
#   bend hub/main.bend -o sb-core && SB_CORE_PORT=7790 ./sb-core
#
# The Rust daemon connects over TCP (127.0.0.1) and writes one JSON input
# per line; sb-core answers one JSON line per input:
#   {"fx": [...], "dirty": bool}   the effects of the input (committed)
#   {"need": {...}}                an env query (git): the daemon runs it and
#                                  sends the same input again with the answer
#                                  appended to "ans" (nothing was committed)
# Special inputs: {"t":"init","workspace":..} resets the hub, {"t":"replay",
# "ev":..} applies one journal event (boot; answers {"skipped":true} for a
# kind it does not know), {"t":"ping"} answers {}.
# The state lives across connections.
import Base

import ../vendor/json.bend as J

import ./model.bend as M
import ./replay.bend as RP

import ./codec.bend as C

import ./cx.bend as X

import ./core.bend as H

import ./view.bend as V

# his message a step made (A1: AStep.msg)
import ./said.bend as SD

# his answer to a card a step made (inbox picks (3): AStep.ans_*)
import ./picks.bend as PK

# the link's requests and answers, generated from bise_proto::core
import ./gen/link.bend as L

import ./gen/fx.bend as F

type Got is Type:
  Got{s: Socket, h: H.Hub, buf: String}

type Split is Data:
  Split{line: String, rest: String}

type Flow is Type:
  Go{h: H.Hub}

def fx_json(f: X.Fx) -> J.Json:
  match f:
    case X.FJ{+e}:
      J.obj(F.journal(C.ev_json(e)))
    case X.FO{+o}:
      o

def fxs_json(xs: List<&2, X.Fx>) -> List<&2, J.Json>:
  match xs:
    case Nil{}:
      Nil{}
    case Con{+h, +t}:
      fx_json(h) <> fxs_json(t)

# `before`: the runtime and wait marks before the step (V.changed). The
# view carries only what the step changed: an idle tick answers a few
# hundred bytes, whatever the history (idle-cpu). `msg`: the id of his
# message the step made (SD.said), for the asker's send result (A1).
# `ans_*`: his answer to a card in the step (X.R.answered), for the
# answer's result (inbox picks (3), architect m_22636)
def answer.go(need: Maybe<&2, J.Json>, +h: H.Hub, +fx: List<&2, X.Fx>, +before: List<&2, V.Mark>) -> H.Hub & String:
  match need:
    case Some{+q}:
      (h, J.stringify(L.answer_need(q)))
    case None{}:
      (h, J.stringify(L.answer_step(fxs_json(fx), X.R.dirty(H.Hub.r(h)),
        V.view(H.Hub.d(h), X.R.rts(H.Hub.r(h)), X.R.waiters(H.Hub.r(h)), False{}, V.touched(X.journal(fx)),
          V.changed(X.journal(fx), before, X.R.rts(H.Hub.r(h)), X.R.waiters(H.Hub.r(h))),
          X.journal(fx)),
        SD.said_id(SD.said(X.journal(fx))),
        PK.card_of(X.R.answered(H.Hub.r(h))), PK.who_of(X.R.answered(H.Hub.r(h))), PK.said_of(X.R.answered(H.Hub.r(h))),
        PK.ask_of(X.R.answered(H.Hub.r(h))), PK.pick_of_ans(X.R.answered(H.Hub.r(h))))))

# the answer line of a committed step (H.commit, the law run_replays)
def answer(+before: List<&2, V.Mark>, +o: H.Out) -> H.Hub & String:
  answer.go(H.Out.need(o), H.Out.hub(o), H.Out.fx(o), before)

# an event this hub does not know (written by a newer hub, before a
# /version rollback) is not applied: the answer says so, the Rust side logs it
def replay(+h: H.Hub, m: Maybe<&2, M.Ev>) -> H.Hub & String:
  match m:
    case None{}:
      (h, J.stringify(L.answer_skipped(True{})))
    case Some{+e}:
      (H.Hub{M.apply(H.Hub.d(h), e), H.Hub.r(h)}, J.stringify(L.answer_done()))

# {"t":"replay_many","evs":[..]}: a batch of journal events at boot,
# answered {"skipped":[<index in the batch>..]}. St.hot is every message
# at the end of the batch (M.hot_all). The messages stay newest
# first through the batch (replay.bend's apply_rev): linear, where one `replay` per
# event was quadratic in the messages (a 20k-event journal: ~18 s).
def evs_of(evs: List<&2, J.Json>) -> List<&2, Maybe<&2, M.Ev>>:
  match evs:
    case Nil{}:
      Nil{}
    case Con{+e, +rest}:
      C.ev_of(e) <> evs_of(rest)

def replay_many.go(ms: List<&2, Maybe<&2, M.Ev>>, +st: M.St, +i: Nat, +sk: List<&2, Nat>) -> M.St & List<&2, Nat>:
  match ms:
    case Nil{}:
      (st, List.reverse(&2, Nat, sk))
    case Con{None{}, +rest}:
      replay_many.go(rest, st, 1n+i, i <> sk)
    case Con{Some{+e}, +rest}:
      replay_many.go(rest, RP.apply_rev(e, st), 1n+i, sk)

def replay_many.done(p: M.St & List<&2, Nat>, +r: X.R) -> H.Hub & String:
  match p:
    case (+d, +sk):
      (H.Hub{M.hot_all(RP.msgs_rev(d)), r}, J.stringify(L.answer_skipped_at(sk)))

def replay_many(+h: H.Hub, +evs: List<&2, J.Json>) -> H.Hub & String:
  replay_many.done(replay_many.go(evs_of(evs), RP.msgs_rev(H.Hub.d(h)), 0n, Nil{}), H.Hub.r(h))

# the link's own requests (gen/link.bend, from bise_proto::core::Link);
# any other tag is a step of sb-core
def handle.link(l: L.Link, +h: H.Hub, +i: J.Json) -> H.Hub & String:
  match l:
    case L.TInit{+workspace}:
      (H.hub_new(workspace), J.stringify(L.answer_done()))
    case L.TReplay{+ev}:
      replay(h, C.ev_of(ev))
    case L.TReplayMany{+evs}:
      replay_many(h, evs)
    case L.TPing{}:
      (h, J.stringify(L.answer_done()))
    case L.TView{}:
      (h, J.stringify(L.answer_view(V.view(H.Hub.d(h), X.R.rts(H.Hub.r(h)), X.R.waiters(H.Hub.r(h)), True{}, Nil{}, Nil{}, Nil{}))))
    case L.TStep{}:
      answer(V.marks(X.R.rts(H.Hub.r(h)), X.R.waiters(H.Hub.r(h))), H.commit(h, i))

def handle.parsed(r: Result<&2, &2, String, J.Json>, +h: H.Hub) -> H.Hub & String:
  match r:
    case Fail{+e}:
      (h, J.stringify(L.answer_error(String.append("json: ", e))))
    case Done{+i}:
      handle.link(L.of(i), h, i)

# one input line
def handle(+h: H.Hub, +line: String) -> H.Hub & String:
  handle.parsed(J.parse(line), h)

# ---- the line server ----

def send_line.after(r: Socket & Result<&1, &1, U32 & String, Unit>) -> IO(Socket):
  match r:
    case (s, _):
      IO.pure(Socket, s)

def send_line(s: Socket, +text: String) -> IO(Socket):
  do IO<Socket>:
    r : Socket & Result<&1, &1, U32 & String, Unit> <- TCP.send(s, String.append(text, "\n"))
    send_line.after(r)

# split the buffer at the first newline: (line, rest), or None
def split_line.go(s: String, +acc: String) -> Maybe<&2, Split>:
  match s:
    case SNil{}:
      None{}
    case SCon{'\n', +t}:
      Some{Split{String.reverse(acc), t}}
    case SCon{+c, +t}:
      # a pattern, not Bool.pick: pick computes both of its arguments, so
      # it reversed the whole prefix at every char (quadratic in the line)
      split_line.go(t, SCon{c, acc})

def split_line(+s: String) -> Maybe<&2, Split>:
  split_line.go(s, "")

@unsafe
def lines(s: Socket, +h: H.Hub, +buf: String) -> IO(Got):
  lines.split(split_line(buf), s, h, buf)

@unsafe
def lines.answer(p: H.Hub & String, s: Socket, +rest: String) -> IO(Got):
  match p:
    case (+h2, +out):
      do IO<Got>:
        s2 : Socket <- send_line(s, out)
        lines(s2, h2, rest)

@unsafe
def lines.split(m: Maybe<&2, Split>, s: Socket, +h: H.Hub, +buf: String) -> IO(Got):
  match m:
    case None{}:
      IO.pure(Got, Got{s, h, buf})
    case Some{Split{+l, +rest}}:
      lines.answer(handle(h, l), s, rest)

@unsafe
def conn.after(rm: Socket & Result<&1, &1, U32 & String, String>, +h: H.Hub, +buf: String) -> IO(H.Hub):
  match rm:
    case (s, Fail{_}):
      do IO<H.Hub>:
        Socket.close(s)
        IO.pure(H.Hub, h)
    case (s, Done{+data}):
      conn.data(String.is_empty(data), s, h, String.append(buf, data))

@unsafe
def conn(s: Socket, +h: H.Hub, +buf: String) -> IO(H.Hub):
  do IO<H.Hub>:
    rm : Socket & Result<&1, &1, U32 & String, String> <- TCP.recv(s, 65536)
    conn.after(rm, h, buf)

@unsafe
def conn.next(r: Got) -> IO(H.Hub):
  match r:
    case Got{s, +h, +buf}:
      conn(s, h, buf)

@unsafe
def conn.data(closed: Bool, s: Socket, +h: H.Hub, +buf: String) -> IO(H.Hub):
  match closed:
    case True{}:
      do IO<H.Hub>:
        Socket.close(s)
        IO.pure(H.Hub, h)
    case False{}:
      do IO<H.Hub>:
        r : Got <- lines(s, h, buf)
        conn.next(r)

@unsafe
def serve.after(am: Listener & Result<&1, &1, U32 & String, Socket>, +h: H.Hub) -> IO(Unit):
  match am:
    case (l, Fail{_}):
      IO.print("sb-core: accept failed")
    case (l, Done{s}):
      # one connection: its end (the daemon exited or was killed) ends
      # sb-core, so no orphan survives the hub
      do IO<Unit>:
        h2 : H.Hub <- conn(s, h, "")
        IO.pure(Unit, Unit{})

@unsafe
def serve(l: Listener, +h: H.Hub) -> IO(Unit):
  do IO<Unit>:
    am : Listener & Result<&1, &1, U32 & String, Socket> <- TCP.accept(l)
    serve.after(am, h)

def port_of(r: Result<&1, &1, U32 & String, String>) -> U32:
  match r:
    case Fail{_}:
      7790
    case Done{+s}:
      Maybe.default(&2, U32, U32.read(s), 7790)

def main() -> IO(Unit):
  do IO<Unit>:
    pr : Result<&1, &1, U32 & String, String> <- IO.get_env("SB_CORE_PORT")
    +p : U32 <- IO.pure(U32, port_of(pr))
    l : Listener <- IO.try(Listener, TCP.listen("127.0.0.1", p))
    IO.print(String.append("sb-core on 127.0.0.1:", U32.show(p)))
    serve(l, H.hub_new(""))
