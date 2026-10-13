//! A step's answer, applied (core_link.rs's apply_step): its effects run
//! whatever its view, and his message's id (A1) comes back typed; his card
//! answer's route lines (inbox picks). Out of core_tests.rs (its line
//! limit).

use super::*;

/// hot-view: a step whose view doesn't decode (a bug of sb-core's
/// encoder) still applies its effects, the journal's included; the
/// mirror stays as the last good view left it.
#[test]
fn a_step_whose_view_does_not_decode_still_applies_its_effects() {
    use bise_proto::core::{fx as cfx, link::AStep, Fx as CoreFx};
    let mut t = T::new();
    let (agents, order) = (t.hub.st.agents.clone(), t.hub.st.order.clone());
    let s = AStep {
        fx: vec![
            CoreFx::Journal(cfx::Journal { ev: json!({"type": "main_note", "text": "fake", "at_ms": 1}) }),
            CoreFx::Kill(cfx::Kill { agent: "fake".into() }),
        ],
        dirty: true,
        view: json!({"agents": 3, "order": "not a list"}),
        ..Default::default()
    };
    let mut fx = Vec::new();
    t.hub.apply_step(&mut fx, &mut t.env, None, 0, s);
    assert!(fx.contains(&Effect::Kill { agent: "fake".into() }), "{:?}", fx);
    assert!(fx.iter().any(|e| matches!(e, Effect::Journal(ev) if ev["text"] == "fake")), "{:?}", fx);
    assert_eq!((&t.hub.st.agents, &t.hub.st.order), (&agents, &order), "the mirror kept");
}

/// A1: his input's step answers the id sb-core gave his message (typed,
/// AStep.msg), the id his you-id line carries when it is delivered; a
/// queued one too, at arrival. A tick makes none.
#[test]
fn his_input_answers_the_id_of_his_message() {
    let mut t = T::new();
    t.spawn_task("a");
    let you_id = |fx: &[Effect], agent: &str| recs(fx, agent).iter().find(|r| r["sb"] == "you-id").and_then(|r| r["id"].as_u64());
    t.hub.said = None;
    let fx = t.user("main", "first words");
    let said = t.hub.said.take().expect("his input answers his message's id");
    assert_eq!(you_id(&fx, "main"), Some(said), "the answered id is the you-id line's: {fx:?}");
    // `a` is busy: queued, its id at arrival, its you-id line at the turn's end
    let fx = t.user_queued("a", "queued words");
    let q = t.hub.said.take().expect("a queued input has its id at arrival");
    assert!(q > said && you_id(&fx, "a").is_none(), "a fresh id, no line yet: {q} after {said}");
    let fx = t.go(Input::ReplIdle { agent: "a".into(), leftover: false });
    assert_eq!(you_id(&fx, "a"), Some(q), "its line carries the id answered at arrival: {fx:?}");
    assert_eq!(t.hub.said, None, "a turn's end makes no message of his");
    t.go(Input::Tick);
    assert_eq!(t.hub.said, None, "a tick makes none");
}

/// Inbox picks (architect m_22243): his answer '2' to docs' card is said
/// as '2' and picked as that option's words, with the message it became,
/// in main's feed and in docs' own (both feeds, one line each); words
/// get no pick; main's own card: one line, in main's feed alone.
#[test]
fn an_answer_by_number_names_its_option_in_both_feeds() {
    let mut t = T::new();
    t.spawn_task("docs");
    let (_, _) = t.req(
        "docs",
        AgentReq::Send { to: MAIN.into(), text: "where?".into(), expect_reply: true, reply_to: None, queued: false, why: String::new(), switch: None },
    );
    let id = t.hub.st.msgs().values().find(|m| m.text == "where?").unwrap().id;
    t.req(MAIN, AgentReq::Card { text: "where does the balance show?\n1. at every step\n2. only at checkout".into(), for_msg: Some(id) });
    t.turn(MAIN, "asked");
    let card = *t.hub.st.cards.keys().next().unwrap();
    t.hub.answered = None;
    let fx = t.go(Input::UserCmd { client: 1, focus: MAIN.into(), cmd: UserCmd::Answer { card, text: "2".into(), parts: String::new() } });
    // (3): the step's answer is the route line's, the card's question with it
    let a = t.hub.answered.take().expect("the step answers his answer");
    assert_eq!((a.agent.as_str(), a.said.as_str(), a.pick.as_deref()), ("docs", "2", Some("only at checkout")));
    assert!(a.question.starts_with("where does the balance show?") && a.notice == "you answered docs: only at checkout", "{a:?}");
    let answer = t.hub.st.msgs().values().find(|m| m.text == "2").expect("the asker's message, as he said it").id;
    for feed in [MAIN, "docs"] {
        let rs: Vec<Value> = recs(&fx, feed).into_iter().filter(|r| r["sb"] == "route").collect();
        assert_eq!(rs, vec![json!({"sb": "route", "who": "docs", "card": card, "said": "2", "msg": answer, "pick_n": 2, "pick": "only at checkout"})], "{feed}: {fx:?}");
    }
    // words: no pick
    t.req(MAIN, AgentReq::Card { text: "and then?\n1. ship\n2. wait".into(), for_msg: Some(id) });
    let card2 = *t.hub.st.cards.keys().next().unwrap();
    let fx = t.go(Input::UserCmd { client: 1, focus: MAIN.into(), cmd: UserCmd::Answer { card: card2, text: "ship it today".into(), parts: String::new() } });
    let r = recs(&fx, MAIN).into_iter().find(|r| r["sb"] == "route").expect("the route line");
    assert!(r.get("pick").is_none() && r.get("pick_n").is_none() && r["said"] == "ship it today", "{r}");
    let a = t.hub.answered.take().expect("words answer too");
    assert!(a.pick.is_none() && a.said == "ship it today", "{a:?}");
    // a step that answered no card: none
    t.turn(MAIN, "ok");
    assert_eq!(t.hub.answered, None);
    // main's own card: one line, no message, in main's feed alone
    t.req(MAIN, AgentReq::Card { text: "merge?\n1. merge\n2. not yet".into(), for_msg: None });
    let card3 = *t.hub.st.cards.keys().next().unwrap();
    let fx = t.go(Input::UserCmd { client: 1, focus: MAIN.into(), cmd: UserCmd::Answer { card: card3, text: "1".into(), parts: String::new() } });
    let rs: Vec<Value> = recs(&fx, MAIN).into_iter().filter(|r| r["sb"] == "route").collect();
    assert_eq!(rs, vec![json!({"sb": "route", "who": MAIN, "card": card3, "said": "1", "pick_n": 1, "pick": "merge"})], "{fx:?}");
}
