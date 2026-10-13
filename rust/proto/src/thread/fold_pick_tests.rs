//! The fold of his answer by an option's number (inbox picks, architect
//! m_22243/m_22417), apart from fold_tests.rs (its line limit).

use super::*;
use crate::thread::EntryKind;

fn ctx_with<'a>(open: &'a [u64], page: &'a dyn Fn(&str) -> Option<crate::thread::PageRef>) -> Ctx<'a> {
    Ctx { open_cards: open, page, provider: &|id: &str, _: &str| id.to_string(), width: &|s: &str| s.chars().count(), offset: &|_| 0, attached: &crate::thread::Attached::plain }
}

/// Inbox picks (architect m_22243/m_22417): his answer '2' to gift-ui's
/// card reads as the option's words; in gift-ui's own thread the message
/// his answer became (msg-in m_5) and its route line make one row at the
/// message's pos, whichever comes first; main's thread (no msg-in) gets
/// the row as before.
#[test]
fn an_answer_by_number_is_one_row_with_its_words() {
    let page = |_: &str| None;
    let route = r#"sb route :: {"who":"gift-ui","card":2,"said":"2","msg":5,"pick_n":2,"pick":"only at checkout"}"#;
    let ls = vec![
        (1, 1001, "sb msg-in : user m_5 : 2".to_string()),
        (2, 1001, route.to_string()),
        (3, 1002, "sb msg-in : user m_6 : and thanks".to_string()),
    ];
    let e = fold(&ls, &ctx_with(&[], &page));
    assert_eq!(e.iter().map(|e| e.kind).collect::<Vec<_>>(), [EntryKind::Approval, EntryKind::FromAgent]);
    assert_eq!(e[0].pos, 1, "the row takes the message's pos");
    assert_eq!(e[0].msg, Some(5));
    assert!(e[0].text.contains("only at checkout") && !e[0].text.ends_with(" 2"), "{}", e[0].text);
    assert!(e.iter().all(|e| e.payload_matches_kind()));
    // the route line first: the later msg-in makes no entry
    let ls = vec![(1, 1001, route.to_string()), (2, 1002, "sb msg-in : user m_5 : 2".to_string())];
    let e = fold(&ls, &ctx_with(&[], &page));
    assert_eq!(e.iter().map(|e| e.kind).collect::<Vec<_>>(), [EntryKind::Approval]);
    // main's thread: no msg-in, the row at the route's pos; words or an
    // old line without a pick read as he said them
    let ls = vec![
        (7, 1001, route.to_string()),
        (8, 1002, r#"sb route :: {"who":"gift-ui","card":3,"said":"later, please"}"#.to_string()),
    ];
    let e = fold(&ls, &ctx_with(&[], &page));
    assert_eq!(e.iter().map(|e| (e.pos, e.kind)).collect::<Vec<_>>(), [(7, EntryKind::Approval), (8, EntryKind::Approval)]);
    assert!(e[1].text.contains("later, please"), "{}", e[1].text);
}
