# bend/proofs/threads.bend: the proofs of bend/laws/threads.bend (moved from
# PROOF.bend). Each holds by unfolding the definitions involved; the
# checker verifies the equalities.
import Base
import ../hub/model.bend as HM
import ../hub/cx.bend as HX
import ../hub/core.bend as HC
import ../hub/picks.bend as HPK
import ../hub/keyed.bend as HKL
import ../hub/gen/feed.bend as HFD
import ../hub/said.bend as HSD
import ./lib/hub-1.bend as PL1
import ./lib/hub-2.bend as PL2
import ../laws/threads.bend as Laws

# ---- L4 support: a delivery attempt never leaves its agent stuck ----

def hub_rt_put_find.pick(c: Bool, +h: HX.Rt, +t: List<&2, HX.Rt>, +n: String, +run: HM.Run, +w: Bool, +tm: Maybe<&2, Nat>, +k: Nat,
    +e: {String.eq(HX.Rt.name(h), n) == c : Bool}, ih: {HC.rt_find(HC.rt_put(t, HX.Rt{n, run, w, tm, k}), n) == HX.Rt{n, run, w, tm, k} : HX.Rt})
    -> {HC.rt_find(Bool.pick(List<&2, HX.Rt>, String.eq(HX.Rt.name(h), n), HX.Rt{n, run, w, tm, k} <> t, h <> HC.rt_put(t, HX.Rt{n, run, w, tm, k})), n) == HX.Rt{n, run, w, tm, k} : HX.Rt}:
  match c:
    case True{}:
      %Equal.sym(Bool, String.eq(HX.Rt.name(h), n), True{}, e) : {HC.rt_find(Bool.pick(List<&2, HX.Rt>, _, HX.Rt{n, run, w, tm, k} <> t, h <> HC.rt_put(t, HX.Rt{n, run, w, tm, k})), n) == HX.Rt{n, run, w, tm, k} : HX.Rt}
      %Equal.sym(Bool, String.eq(n, n), True{}, PL2.hub_str_eq_refl(n)) : {Bool.pick(HX.Rt, _, HX.Rt{n, run, w, tm, k}, HC.rt_find(t, n)) == HX.Rt{n, run, w, tm, k} : HX.Rt}
      {==}
    case False{}:
      %Equal.sym(Bool, String.eq(HX.Rt.name(h), n), False{}, e) : {HC.rt_find(Bool.pick(List<&2, HX.Rt>, _, HX.Rt{n, run, w, tm, k} <> t, h <> HC.rt_put(t, HX.Rt{n, run, w, tm, k})), n) == HX.Rt{n, run, w, tm, k} : HX.Rt}
      %Equal.sym(Bool, String.eq(HX.Rt.name(h), n), False{}, e) : {Bool.pick(HX.Rt, _, h, HC.rt_find(HC.rt_put(t, HX.Rt{n, run, w, tm, k}), n)) == HX.Rt{n, run, w, tm, k} : HX.Rt}
      ih

# putting an agent's runtime state and reading it back gives it
def hub_rt_put_find(+xs: List<&2, HX.Rt>, +n: String, +run: HM.Run, +w: Bool, +tm: Maybe<&2, Nat>, +k: Nat)
    -> {HC.rt_find(HC.rt_put(xs, HX.Rt{n, run, w, tm, k}), n) == HX.Rt{n, run, w, tm, k} : HX.Rt}:
  match xs:
    case Nil{}:
      %Equal.sym(Bool, String.eq(n, n), True{}, PL2.hub_str_eq_refl(n)) : {Bool.pick(HX.Rt, _, HX.Rt{n, run, w, tm, k}, HC.rt_find(Nil{}, n)) == HX.Rt{n, run, w, tm, k} : HX.Rt}
      {==}
    case Con{h, t}:
      hub_rt_put_find.pick(String.eq(HX.Rt.name(h), n), h, t, n, run, w, tm, k, {==}, hub_rt_put_find(t, n, run, w, tm, k))

# ---- cost-pause: a delivery keeps the pause (L4 support) ----

def hub_rts(-o: HM.St, +cx: HX.Cx<o>) -> List<&2, HX.Rt>:
  HX.R.rts(HX.Cx.r(o, cx))

def hub_rts_set_rt(-o: HM.St, cx: HX.Cx<o>, +x: HX.Rt) -> {hub_rts(o, HC.set_rt(o, cx, x)) == HC.rt_put(hub_rts(o, cx), HC.rt_next(HC.rt(o, cx, HX.Rt.name(x)), x)) : List<&2, HX.Rt>}:
  match cx:
    case HX.Cx{c, r}:
      match r:
        case HX.R{a, b, c2, d, e, f, g, h, i, j, k, l, m}:
          {==}

def Laws.interrupt_says_stopped_once(o, cx, n, e):
  %Equal.sym(Bool, HC.is_busy(HX.Rt.run(HC.rt(o, cx, n))), True{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.stopped(o, HC.interrupt.fx(o, cx, n), n), u => HC.notice(o, cx, "no turn in progress to interrupt")) == HC.feed(o, HC.interrupt.fx(o, cx, n), n, HFD.stopped("stopped")) : HX.Cx<o>}
  {==}

def Laws.interrupt_idle_says_nothing(o, cx, n, e):
  %Equal.sym(Bool, HC.is_busy(HX.Rt.run(HC.rt(o, cx, n))), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.stopped(o, HC.interrupt.fx(o, cx, n), n), u => HC.notice(o, cx, "no turn in progress to interrupt")) == HC.notice(o, cx, "no turn in progress to interrupt") : HX.Cx<o>}
  {==}

def Laws.req_interrupt_says_stopped_once(o, cx, token, agent, n, e):
  %Equal.sym(Bool, HC.is_busy(HX.Rt.run(HC.rt(o, cx, n))), True{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.reply(o, HC.stopped(o, HC.interrupt.fx(o, cx, n), n), token, HC.ok_body(Nil{})), u => HC.reply_err(o, cx, token, "no turn in progress")) == HC.reply(o, HC.feed(o, HC.interrupt.fx(o, cx, n), n, HFD.stopped("stopped")), token, HC.ok_body(Nil{})) : HX.Cx<o>}
  {==}

def Laws.task_send_says_sent_once(o, cx, m, e):
  %Equal.sym(Bool, HC.is_task_send(o, cx, HM.Msg.from(m), HM.Msg.to(m)), True{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.feed(o, cx, HM.Msg.from(m), HFD.sent(HM.Msg.to(m), HM.Msg.id(m), HM.Msg.expect(m), HM.Msg.text(m))), u => cx) == HC.feed(o, cx, HM.Msg.from(m), HFD.sent(HM.Msg.to(m), HM.Msg.id(m), HM.Msg.expect(m), HM.Msg.text(m))) : HX.Cx<o>}
  {==}

def Laws.other_send_says_no_sent(o, cx, m, e):
  %Equal.sym(Bool, HC.is_task_send(o, cx, HM.Msg.from(m), HM.Msg.to(m)), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.feed(o, cx, HM.Msg.from(m), HFD.sent(HM.Msg.to(m), HM.Msg.id(m), HM.Msg.expect(m), HM.Msg.text(m))), u => cx) == cx : HX.Cx<o>}
  {==}

def Laws.task_card_shows_in_its_feed(o, cx, id, agent, text, e):
  %Equal.sym(Bool, HC.is_task_of(o, cx, agent), True{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.feed(o, cx, agent, HFD.card(id, "question", agent, text)), u => cx) == HC.feed(o, cx, agent, HFD.card(id, "question", agent, text)) : HX.Cx<o>}
  {==}

def Laws.other_card_no_extra_line(o, cx, id, agent, text, e):
  %Equal.sym(Bool, HC.is_task_of(o, cx, agent), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => HC.feed(o, cx, agent, HFD.card(id, "question", agent, text)), u => cx) == cx : HX.Cx<o>}
  {==}

def Laws.unknown_sender_is_no_task_send(o, cx, from, to, e):
  %Equal.sym(Bool, HC.has_agent(o, cx, from), False{}, e) : {Bool.and(Bool.and(_, Bool.not(String.eq(from, HM.MAIN()))), Bool.not(String.eq(to, HM.USER()))) == False{} : Bool}
  {==}

def Laws.unknown_agent_is_no_task(o, cx, agent, e):
  %Equal.sym(Bool, HC.has_agent(o, cx, agent), False{}, e) : {Bool.and(_, Bool.not(String.eq(agent, HM.MAIN()))) == False{} : Bool}
  {==}

def Laws.main_card_answer_routes_once(o, cx, c, text, parts):
  {==}

def Laws.you_line_carries_its_id(o, cx, name, m, e):
  +ln = HC.feed(o, HC.feed(o, cx, name, HFD.you(HM.Msg.text(m))), name, HFD.you_id(HM.Msg.id(m)))
  %Equal.sym(Bool, String.is_empty(HM.Msg.parts(m)), True{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => ln, u => HC.feed(o, ln, name, HFD.you_parts(HC.parts_json(HM.Msg.parts(m))))) == ln : HX.Cx<o>}
  {==}

def Laws.you_parts_follow_the_id(o, cx, name, m, e):
  +ln = HC.feed(o, HC.feed(o, cx, name, HFD.you(HM.Msg.text(m))), name, HFD.you_id(HM.Msg.id(m)))
  +rec = HFD.you_parts(HC.parts_json(HM.Msg.parts(m)))
  %Equal.sym(Bool, String.is_empty(HM.Msg.parts(m)), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => ln, u => HC.feed(o, ln, name, rec)) == HC.feed(o, ln, name, rec) : HX.Cx<o>}
  {==}

def Laws.parts_never_change_text(o, cx, name, m, p):
  match m:
    case HM.Msg{i, th, f, to, r, ex, a, tx, c, pl, q, v, pa}:
      {==}

def Laws.no_parts_no_line(o, cx, who, card, said):
  {==}

def Laws.route_parts_follow_the_route(o, cx, who, card, said, parts, e):
  +ln = HC.feed(o, cx, HM.MAIN(), HFD.route(who, card, said, None{}, None{}, None{}))
  +rec = HFD.route_parts(HC.parts_json(parts))
  %Equal.sym(Bool, String.is_empty(parts), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => ln, u => HC.feed(o, ln, HM.MAIN(), rec)) == HC.feed(o, ln, HM.MAIN(), rec) : HX.Cx<o>}
  {==}

def Laws.an_option_number_gets_its_words():
  {==}

def Laws.words_get_no_pick():
  {==}

def Laws.a_number_off_the_list_gets_no_pick():
  {==}

def Laws.pick_both_or_neither(p):
  match p:
    case None{}:
      {==}
    case Some{k}:
      match k:
        case HPK.Pick{n, w}:
          {==}

def Laws.the_answer_line_keeps_said(who, c, said, msg):
  {==}

def Laws.answer_who_with_its_card(m):
  match m:
    case None{}:
      {==}
    case Some{a}:
      {==}

def Laws.answer_said_with_its_card(m):
  match m:
    case None{}:
      {==}
    case Some{a}:
      {==}

def Laws.answer_ask_with_its_card(m):
  match m:
    case None{}:
      {==}
    case Some{a}:
      {==}

def Laws.answer_pick_needs_the_card(m):
  match m:
    case None{}:
      {==}
    case Some{a}:
      match a:
        case HPK.Ans{c, w, s, q, p}:
          match p:
            case None{}:
              {==}
            case Some{k}:
              match k:
                case HPK.Pick{n, x}:
                  {==}

def Laws.the_steps_pick_is_the_route_lines(c, who, said):
  {==}

def Laws.the_noted_answer_is_read_back(o, cx, a):
  match cx:
    case HX.Cx{k, r}:
      match r:
        case HX.R{a1, b, c2, d, e, f, g, h, i, j, k2, l, m}:
          {==}

def Laws.an_agents_answer_is_in_the_askers_feed(o, cx, asker, c, said, parts, msg, e):
  +ln = HC.answer_line(o, cx, asker, asker, c, said, parts, msg)
  %Equal.sym(Bool, String.eq(asker, HM.MAIN()), False{}, e) : {HC.pick_lazy(HX.Cx<o>, _, u => cx, u => ln) == ln : HX.Cx<o>}
  {==}

def Laws.mains_own_answer_is_one_line(o, cx, c, said, parts, msg):
  {==}

def Laws.answer_keeps_its_parts(to, text, r, parts):
  {==}

def Laws.steered_receipt_names_the_new_ones(o, cx, agent, h, t, total):
  {==}

def Laws.steered_receipt_after_all_seen_is_nothing(o, cx, agent, ids, total):
  match ids:
    case Nil{}:
      {==}
    case Con{h, t}:
      Laws.steered_receipt_after_all_seen_is_nothing(o, cx, agent, t, total)

# the cursor read back after the agent's entry was dropped and put last
def hub_seen_snoc_del.pick(c: Bool, +h: HX.Steer, +t: List<&2, HX.Steer>, +n: String, +s: List<&2, Nat>, +k: Nat, +r: Nat,
    +e: {String.eq(HX.Steer.agent(h), n) == c : Bool},
    ih: {HKL.steer_seen(HM.snoc(HX.Steer, HKL.steer_del(t, n), HX.Steer{n, s, k, r}), n) == k : Nat})
    -> {HKL.steer_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, String.eq(HX.Steer.agent(h), n), HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == k : Nat}:
  match c:
    case True{}:
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), True{}, e) : {HKL.steer_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, _, HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == k : Nat}
      ih
    case False{}:
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), False{}, e) : {HKL.steer_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, _, HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == k : Nat}
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), False{}, e) : {Bool.pick(Nat, _, HX.Steer.seen(h), HKL.steer_seen(HM.snoc(HX.Steer, HKL.steer_del(t, n), HX.Steer{n, s, k, r}), n)) == k : Nat}
      ih

def hub_seen_snoc_del(+xs: List<&2, HX.Steer>, +n: String, +s: List<&2, Nat>, +k: Nat, +r: Nat)
    -> {HKL.steer_seen(HM.snoc(HX.Steer, HKL.steer_del(xs, n), HX.Steer{n, s, k, r}), n) == k : Nat}:
  match xs:
    case Nil{}:
      %Equal.sym(Bool, String.eq(n, n), True{}, PL2.hub_str_eq_refl(n)) : {Bool.pick(Nat, _, k, 0n) == k : Nat}
      {==}
    case Con{h, t}:
      hub_seen_snoc_del.pick(String.eq(HX.Steer.agent(h), n), h, t, n, s, k, r, {==}, hub_seen_snoc_del(t, n, s, k, r))

def Laws.steer_add_keeps_seen(xs, n, ids):
  hub_seen_snoc_del(xs, n, List.append(&2, Nat, HKL.steer_get(xs, n), ids), HKL.steer_seen(xs, n), HKL.steer_rx_seen(xs, n))

def Laws.steer_rx_receipt_names_the_new_ones(o, cx, agent, h, t, total):
  {==}

def Laws.steer_rx_receipt_after_all_seen_is_nothing(o, cx, agent, ids, total):
  match ids:
    case Nil{}:
      {==}
    case Con{h, t}:
      Laws.steer_rx_receipt_after_all_seen_is_nothing(o, cx, agent, t, total)

# the received cursor read back after the agent's entry was dropped and
# put last
def hub_rx_seen_snoc_del.pick(c: Bool, +h: HX.Steer, +t: List<&2, HX.Steer>, +n: String, +s: List<&2, Nat>, +k: Nat, +r: Nat,
    +e: {String.eq(HX.Steer.agent(h), n) == c : Bool},
    ih: {HKL.steer_rx_seen(HM.snoc(HX.Steer, HKL.steer_del(t, n), HX.Steer{n, s, k, r}), n) == r : Nat})
    -> {HKL.steer_rx_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, String.eq(HX.Steer.agent(h), n), HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == r : Nat}:
  match c:
    case True{}:
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), True{}, e) : {HKL.steer_rx_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, _, HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == r : Nat}
      ih
    case False{}:
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), False{}, e) : {HKL.steer_rx_seen(HM.snoc(HX.Steer, Bool.pick(List<&2, HX.Steer>, _, HKL.steer_del(t, n), h <> HKL.steer_del(t, n)), HX.Steer{n, s, k, r}), n) == r : Nat}
      %Equal.sym(Bool, String.eq(HX.Steer.agent(h), n), False{}, e) : {Bool.pick(Nat, _, HX.Steer.rx_seen(h), HKL.steer_rx_seen(HM.snoc(HX.Steer, HKL.steer_del(t, n), HX.Steer{n, s, k, r}), n)) == r : Nat}
      ih

def hub_rx_seen_snoc_del(+xs: List<&2, HX.Steer>, +n: String, +s: List<&2, Nat>, +k: Nat, +r: Nat)
    -> {HKL.steer_rx_seen(HM.snoc(HX.Steer, HKL.steer_del(xs, n), HX.Steer{n, s, k, r}), n) == r : Nat}:
  match xs:
    case Nil{}:
      %Equal.sym(Bool, String.eq(n, n), True{}, PL2.hub_str_eq_refl(n)) : {Bool.pick(Nat, _, r, 0n) == r : Nat}
      {==}
    case Con{h, t}:
      hub_rx_seen_snoc_del.pick(String.eq(HX.Steer.agent(h), n), h, t, n, s, k, r, {==}, hub_rx_seen_snoc_del(t, n, s, k, r))

def Laws.steer_add_keeps_rx_seen(xs, n, ids):
  hub_rx_seen_snoc_del(xs, n, List.append(&2, Nat, HKL.steer_get(xs, n), ids), HKL.steer_seen(xs, n), HKL.steer_rx_seen(xs, n))

# ---- his queued message taken back ----

# a notice changes no state (an out effect only)
def hub_d_notice(-o: HM.St, +cx: HX.Cx<o>, +t: String) -> {HX.d(o, HC.notice(o, cx, t)) == HX.d(o, cx) : HM.St}:
  match cx:
    case HX.Cx{c, r}:
      match c:
        case HX.Core{d, fx, p, f, q, v}:
          {==}

def Laws.unqueue_takes_back_a_queued_one(o, cx, q, id, to):
  {==}

def Laws.unqueue_leaves_a_delivered_one(o, cx, id, to):
  hub_d_notice(o, cx, HC.cat([HC.mid(id), " already reached @", to, ": it can't be taken back"]))

def Laws.unqueue_leaves_a_rejected_one(o, cx, r, id, to):
  hub_d_notice(o, cx, HC.cat([HC.mid(id), " isn't waiting any more"]))

def Laws.unqueue_leaves_an_unknown_id(o, cx, id):
  hub_d_notice(o, cx, HC.cat(["no message ", HC.mid(id), " to take back"]))

def Laws.unqueue_never_takes_anothers(o, cx, r, id, e):
  %Equal.sym(Bool, String.eq(HM.Msg.from(HM.MRec.msg(r)), HM.USER()), False{}, e) : {HX.d(o, HC.pick_lazy(HX.Cx<o>, _, u => HC.unqueue.take(o, HM.MRec.st(r), cx, id, HM.Msg.to(HM.MRec.msg(r))), u => HC.notice(o, cx, HC.cat([HC.mid(id), " isn't one of your messages"])))) == HX.d(o, cx) : HM.St}
  hub_d_notice(o, cx, HC.cat([HC.mid(id), " isn't one of your messages"]))

# Nat.is_eq says equal: they are
def hub_nat_eq_sound(+a: Nat, +b: Nat, e: {Nat.is_eq(a, b) == True{} : Bool}) -> {a == b : Nat}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bp:
      PL1.hub_absurd_eq(PL1.hub_ft_absurd(e), Nat, 0n, 1n+bp)
    case 1n+ap 0n:
      PL1.hub_absurd_eq(PL1.hub_ft_absurd(e), Nat, 1n+ap, 0n)
    case 1n+ap 1n+bp:
      Equal.cong(Nat, Nat, k => 1n+k, ap, bp, hub_nat_eq_sound(ap, bp, e))

def hub_uq_own.pick(c: Bool, +m: HM.Msg, +s: HM.MSt, +se: Bool, +t: List<&2, HM.MRec>, +id: Nat, +x: HM.MSt,
    +e: {Nat.is_eq(HM.Msg.id(m), id) == c : Bool},
    ih: {HM.state_of.go(HM.rec_of(HM.map_msg(t, id, HM.OSt{x}), id)) == HC.st_after(HM.rec_of(t, id), x) : Maybe<&2, HM.MSt>})
    -> {HM.state_of.go(HM.rec_of(Bool.pick(List<&2, HM.MRec>, Nat.is_eq(HM.Msg.id(m), id), HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), id))
        == HC.st_after(HM.rec_of(HM.MRec{m, s, se} <> t, id), x) : Maybe<&2, HM.MSt>}:
  match c:
    case True{}:
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), True{}, e) : {HM.state_of.go(HM.rec_of(Bool.pick(List<&2, HM.MRec>, _, HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), id)) == HC.st_after(HM.rec_of(HM.MRec{m, s, se} <> t, id), x) : Maybe<&2, HM.MSt>}
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), True{}, e) : {HM.state_of.go(Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, x, se}}, HM.rec_of(t, id))) == HC.st_after(Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, s, se}}, HM.rec_of(t, id)), x) : Maybe<&2, HM.MSt>}
      {==}
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), False{}, e) : {HM.state_of.go(HM.rec_of(Bool.pick(List<&2, HM.MRec>, _, HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), id)) == HC.st_after(HM.rec_of(HM.MRec{m, s, se} <> t, id), x) : Maybe<&2, HM.MSt>}
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), False{}, e) : {HM.state_of.go(Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, s, se}}, HM.rec_of(HM.map_msg(t, id, HM.OSt{x}), id))) == HC.st_after(Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, s, se}}, HM.rec_of(t, id)), x) : Maybe<&2, HM.MSt>}
      ih

def hub_uq_own(+xs: List<&2, HM.MRec>, +id: Nat, +x: HM.MSt)
    -> {HM.state_of.go(HM.rec_of(HM.map_msg(xs, id, HM.OSt{x}), id)) == HC.st_after(HM.rec_of(xs, id), x) : Maybe<&2, HM.MSt>}:
  match xs:
    case Nil{}:
      {==}
    case Con{h, t}:
      match h:
        case HM.MRec{m, s, se}:
          hub_uq_own.pick(Nat.is_eq(HM.Msg.id(m), id), m, s, se, t, id, x, {==}, hub_uq_own(t, id, x))

def Laws.unqueue_marks_its_own_record(xs, id, x):
  hub_uq_own(xs, id, x)

def hub_uq_other.pick(c: Bool, +m: HM.Msg, +s: HM.MSt, +se: Bool, +t: List<&2, HM.MRec>, +id: Nat, +x: HM.MSt, +y: Nat,
    +e: {Nat.is_eq(HM.Msg.id(m), id) == c : Bool},
    eo: {Nat.is_eq(id, y) == False{} : Bool},
    ih: {HM.rec_of(HM.map_msg(t, id, HM.OSt{x}), y) == HM.rec_of(t, y) : Maybe<&2, HM.MRec>})
    -> {HM.rec_of(Bool.pick(List<&2, HM.MRec>, Nat.is_eq(HM.Msg.id(m), id), HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), y)
        == HM.rec_of(HM.MRec{m, s, se} <> t, y) : Maybe<&2, HM.MRec>}:
  match c:
    case True{}:
      +same = hub_nat_eq_sound(HM.Msg.id(m), id, e)
      +ny = Equal.trans(Bool, Nat.is_eq(HM.Msg.id(m), y), Nat.is_eq(id, y), False{},
        Equal.cong(Nat, Bool, a => Nat.is_eq(a, y), HM.Msg.id(m), id, same), eo)
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), True{}, e) : {HM.rec_of(Bool.pick(List<&2, HM.MRec>, _, HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), y) == HM.rec_of(HM.MRec{m, s, se} <> t, y) : Maybe<&2, HM.MRec>}
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), y), False{}, ny) : {Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, x, se}}, HM.rec_of(t, y)) == Bool.pick(Maybe<&2, HM.MRec>, _, Some{HM.MRec{m, s, se}}, HM.rec_of(t, y)) : Maybe<&2, HM.MRec>}
      {==}
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(HM.Msg.id(m), id), False{}, e) : {HM.rec_of(Bool.pick(List<&2, HM.MRec>, _, HM.MRec{m, x, se} <> t, HM.MRec{m, s, se} <> HM.map_msg(t, id, HM.OSt{x})), y) == HM.rec_of(HM.MRec{m, s, se} <> t, y) : Maybe<&2, HM.MRec>}
      Equal.cong(Maybe<&2, HM.MRec>, Maybe<&2, HM.MRec>, z => Bool.pick(Maybe<&2, HM.MRec>, Nat.is_eq(HM.Msg.id(m), y), Some{HM.MRec{m, s, se}}, z),
        HM.rec_of(HM.map_msg(t, id, HM.OSt{x}), y), HM.rec_of(t, y), ih)

def hub_uq_other(+xs: List<&2, HM.MRec>, +id: Nat, +x: HM.MSt, +y: Nat, +eo: {Nat.is_eq(id, y) == False{} : Bool})
    -> {HM.rec_of(HM.map_msg(xs, id, HM.OSt{x}), y) == HM.rec_of(xs, y) : Maybe<&2, HM.MRec>}:
  match xs:
    case Nil{}:
      {==}
    case Con{h, t}:
      match h:
        case HM.MRec{m, s, se}:
          hub_uq_other.pick(Nat.is_eq(HM.Msg.id(m), id), m, s, se, t, id, x, y, {==}, eo, hub_uq_other(t, id, x, y, eo))

def Laws.unqueue_keeps_every_other_record(xs, id, x, y, e):
  hub_uq_other(xs, id, x, y, e)

def Laws.mcp_retry_only_unsent():
  {==}

def Laws.mcp_fail_text_says_why_and_safety():
  {==}

# ---- issue 22: ended turns counted by set_rt ----

def Laws.hub_turns_counts_every_busy_exit(now, n, e):
  match now:
    case HM.RBusy{}:
      PL1.hub_absurd_eq(PL1.hub_ft_absurd(Equal.sym(Bool, True{}, False{}, e)), Nat, HC.turns_after(HM.RBusy{}, HM.RBusy{}, n), 1n+n)
    case HM.RIdle{}:
      {==}
    case HM.RDown{}:
      {==}
    case HM.RStarting{}:
      {==}

def Laws.hub_turns_never_moves_otherwise(was, now, n, e):
  match was:
    case HM.RBusy{}:
      match now:
        case HM.RBusy{}:
          {==}
        case HM.RIdle{}:
          PL1.hub_absurd_eq(PL1.hub_ft_absurd(Equal.sym(Bool, True{}, False{}, e)), Nat, HC.turns_after(HM.RBusy{}, HM.RIdle{}, n), n)
        case HM.RDown{}:
          PL1.hub_absurd_eq(PL1.hub_ft_absurd(Equal.sym(Bool, True{}, False{}, e)), Nat, HC.turns_after(HM.RBusy{}, HM.RDown{}, n), n)
        case HM.RStarting{}:
          PL1.hub_absurd_eq(PL1.hub_ft_absurd(Equal.sym(Bool, True{}, False{}, e)), Nat, HC.turns_after(HM.RBusy{}, HM.RStarting{}, n), n)
    case HM.RIdle{}:
      {==}
    case HM.RDown{}:
      {==}
    case HM.RStarting{}:
      {==}

def Laws.hub_set_rt_counts_turns(o, cx, x):
  match x:
    case HX.Rt{+n, +run, +w, +tm, +k}:
      +t = {HC.turns_after(HX.Rt.run(HC.rt(o, cx, n)), run, HX.Rt.turns(HC.rt(o, cx, n))) : Nat}
      %Equal.sym(List<&2, HX.Rt>, hub_rts(o, HC.set_rt(o, cx, HX.Rt{n, run, w, tm, k})), HC.rt_put(hub_rts(o, cx), HX.Rt{n, run, w, tm, t}),
          hub_rts_set_rt(o, cx, HX.Rt{n, run, w, tm, k})) : {HX.Rt.turns(HC.rt_find(_, n)) == t : Nat}
      %Equal.sym(HX.Rt, HC.rt_find(HC.rt_put(hub_rts(o, cx), HX.Rt{n, run, w, tm, t}), n), HX.Rt{n, run, w, tm, t},
          hub_rt_put_find(hub_rts(o, cx), n, run, w, tm, t)) : {HX.Rt.turns(_) == t : Nat}
      {==}

def Laws.live_pieces_cut_anywhere_same_line():
  {==}

def Laws.live_off_streams_nothing():
  {==}

def Laws.live_thinking_never_streams():
  {==}

def Laws.live_offset_per_block():
  {==}

def Laws.live_throttle():
  {==}

def Laws.live_fast_reads_as_slow():
  {==}

def Laws.live_streamed_text_is_the_reply():
  {==}

# ---- his send answered with its message's id (A1) ----

# one more event before the journal keeps what the tail's said is
def said_weak(-e: HM.Ev, +t: List<&2, HM.Ev>, s: Maybe<&2, HM.Msg>) -> Laws.SaidIn(t, s) -> Laws.SaidIn(e <> t, s):
  match s:
    case None{}:
      p => Unit{}
    case Some{m}:
      p => Inr{p}

# the head's own message (h: what HSD.his_msg says of it), or the tail's
def said_at(-e: HM.Ev, +t: List<&2, HM.Ev>, h: Maybe<&2, HM.Msg>) -> {HSD.his_msg(e) == h : Maybe<&2, HM.Msg>} -> Laws.SaidIn(t, HSD.said(t)) -> Laws.SaidIn(e <> t, HSD.said.of(h, HSD.said(t))):
  match h:
    case None{}:
      q => ih => said_weak(e, t, HSD.said(t))(ih)
    case Some{m}:
      q => ih => Inl{q}

def Laws.said_is_his(evs):
  match evs:
    case Nil{}:
      Unit{}
    case Con{e, t}:
      said_at(e, t, HSD.his_msg(e))({==})(Laws.said_is_his(t))

def Laws.said_you_id(o, cx, name, m):
  {==}

def Laws.said_id_is_the_msg_id(m):
  {==}
