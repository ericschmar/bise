"""His messages with chips render as chips, never as their tags (msg-parts,
the user: 'les user messages contenant des selections ou des images etc
ne sont plus rendus correctement'), in a real terminal (tmux) against the
fake provider:

1. a message with a quote (a selection, tab), a long paste and a
   clipboard image: the quote line `❝ login · main · 1 line`, the paste's
   chip and row `14 lines`, the image chip `▣ clipboard`;
2. queued (tab during a turn) and steered (enter during a turn) messages
   with a long paste: its chip and row;
3. a message to another agent (`@t3 …` with a paste): the route row says
   his words and the chip, never the tag;
4. his screenshot: a card answer with a quote of main, sent as text by an
   older client (no parts: the fold reads them back from the text) and
   with parts: `you answered t3`, the quote line, his words.

Each check reads his rows only (the accent bar `│` in front; the fake
model's `ack:` reply echoes the tags it read, as a real model's context
does). OUT=<dir>: each step's screen is saved there too (tui-parity runs
the same steps against the pre-protocol terminal).

python3 -u tests/tui_msg_parts_tmux.py
"""
import base64
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e  # noqa: E402
from tui_tmux import tui_session, run, tmux, wait_until, MAIN_IDLE  # noqa: E402

COLS, ROWS = 140, 50
HINT = "tab quote"
TAGS = ("<selection", "</selection>", "<pasted", "</pasted>", "<image name=")
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
PASTE = "".join("pasted line %d\n" % i for i in range(1, 15))
OUT = os.environ.get("OUT")


def mine(sc):
    """His rows: the accent bar in front (a message of his, the words of
    an answer of his)."""
    # the frame's border, the glyph column, then his bar (an agent's
    # reply has none: its glyph, then its words)
    return [r for r in sc.splitlines() if re.match(r"^[│|]\s+[│|]  \S", r)]


def expect(ok, msg):
    """A check; PARITY=1 (the same steps on an older tree): said, not
    raised, so every step's screen is saved."""
    if ok:
        return
    if os.environ.get("PARITY"):
        print("DIFF: " + msg)
        return
    raise AssertionError(msg)


def no_tag(rows, what):
    bad = [r for r in rows if any(t in r for t in TAGS)]
    expect(not bad, "%s: a raw tag on his rows: %r" % (what, bad))


def main():
    E = e2e.Env()
    clip = os.path.join(E.tmp, "clip.png")
    with open(clip, "wb") as f:
        f.write(PNG)
    shots = [0]
    with tui_session(COLS, ROWS, "BISE_CTRL_DIGITS=1 BEND_CLIPBOARD_IMAGE_FILE=%s" % clip, E=E) as t:

        def shot(name):
            if OUT:
                os.makedirs(OUT, exist_ok=True)
                shots[0] += 1
                with open(os.path.join(OUT, "%02d-%s.txt" % (shots[0], name)), "w") as f:
                    f.write(t.screen())

        def paste(text):
            tmux("send-keys", "-t", t.name, "-l", "\x1b[200~" + text + "\x1b[201~")

        t.wait("bise :*")
        t.wait_re(MAIN_IDLE)
        t.typed("the login breaks on safari")
        t.keys("Enter")
        t.wait("ack: the login breaks on safari")
        t.wait_re(MAIN_IDLE)

        # 1. a quote (select a word of main's reply, tab), a long paste and
        # a clipboard image in one message
        rows = t.screen().splitlines()
        y = max(i for i, r in enumerate(rows) if "ack: the login" in r)
        x = rows[y].find("login")
        t.typed("\x1b[<0;%d;%dM\x1b[<32;%d;%dM\x1b[<0;%d;%dm" % (x + 1, y + 1, x + 6, y + 1, x + 6, y + 1))
        t.wait(HINT, 10)
        t.keys("Tab")
        t.wait_re(r"❝ 1")
        t.typed("why does ")
        paste(PASTE)
        t.wait_re(r"▤ \d")
        t.typed(" fail with ")
        paste("")
        t.wait_re(r"▣ \d\s+clipboard")
        t.typed(" on safari?")
        t.keys("Enter")
        # sent (its mark), then answered (the fake model echoes what it read)
        t.wait_re(r"on safari\? ✓", 60)
        t.wait("ack: <selection", 60)
        t.wait_re(MAIN_IDLE, 60)
        sc = t.screen()
        shot("quote-paste-image")
        rows = mine(sc)
        no_tag(rows, "his message")
        expect(any("❝ login" in r and "main · 1 line" in r for r in rows), "the quote line: %r" % rows)
        expect(any("why does" in r and "▤" in r for r in rows), "the paste's chip in his words: %r" % rows)
        expect(any("14 lines" in r for r in rows), "the paste's row: %r" % rows)
        expect(any("▣ clipboard" in r for r in rows), "the image's chip: %r" % rows)
        print("ok: a quote, a paste and an image draw as chips")

        # 2. queued and steered, each with a long paste
        # a turn long enough for both (a paste's chip takes a few seconds
        # under load)
        t.typed("[[bash: sleep 25]]")
        t.keys("Enter")
        t.wait("sleep 25", 30)
        t.typed("queued words ")
        paste(PASTE)
        t.wait_re(r"▤ \d")
        t.keys("Tab")
        t.wait("queued · sent when this turn ends")
        t.typed("steered words ")
        paste(PASTE)
        t.wait_re(r"▤ \d")
        t.keys("Enter")
        # the steer goes into this turn, the queued one after it: both
        # answered, then idle
        t.wait("ack: queued words", 120)
        c = e2e.Client(os.path.join(E.state, "hub.sock"))
        c.wait_idle("main", timeout=90)
        t.wait_re(MAIN_IDLE, 60)
        sc = t.screen()
        shot("queued-steered")
        rows = mine(sc)
        no_tag(rows, "queued and steered")
        for w in ("queued words", "steered words"):
            expect(any(w in r and "▤" in r for r in rows), "%s with its chip: %r" % (w, rows))
        expect(sum("14 lines" in r for r in rows) >= 2, "a paste row each: %r" % rows)
        print("ok: queued and steered messages draw their chips")

        # 3. a message to another agent
        c.say("/new t3: hello")
        c.wait_idle("main", "t3", timeout=120)
        t.typed("@t3 look at ")
        paste(PASTE)
        t.wait_re(r"▤ \d")
        t.keys("Enter")
        sc = t.wait_re(r"@t3 : look at ▤" if not os.environ.get("PARITY") else r"@t3 : look at|t3 to you", 30)
        shot("to-another-agent")
        route = [r for r in sc.splitlines() if "@t3 : look at" in r]
        expect(route and not any(tg in r for r in route for tg in TAGS), "the route row: %r" % route)
        print("ok: a message to another agent draws its chip")

        # 4. his screenshot: a card answer with a quote of main, as text
        # (an older client: read back once) and as parts
        quote = '<selection from="main">\nle process\n</selection>\n'
        # an older tree (PARITY) has no JSON-RPC: the text shape, typed
        old = not hasattr(c, "rpc")
        for n, how in enumerate(("text",) if old else ("text", "parts")):
            ask = "quel process %d ?" % n
            c.say('[[bash: sb send main --expect-reply "%s"]]' % ask, focus="t3")
            c.wait(lambda: any(r.get("from") == "t3" and ask in r.get("body", "") for r in c.feed("main", "msg-in")), 120, "t3 asks main")
            c.wait_idle("main", "t3", timeout=120)
            mid = ["m_%d" % r["id"] for r in c.feed("main", "msg-in") if r.get("from") == "t3" and ask in r.get("body", "")][0]
            c.say('[[bash: sb card --for %s "%s"]]' % (mid, ask))
            c.wait(lambda: any(cd["kind"] == "question" for cd in c.cards()), 60, "the card")
            card = [cd for cd in c.cards() if cd["kind"] == "question"][0]
            c.wait_idle("main")
            words = "Son process prenait tout mon CPU! (%s)" % how
            if old:
                c.say("/answer %d %s" % (card["id"], quote + words))
            else:
                params = {"project": c.project(), "card": card["id"], "reply": quote + words}
                if how == "parts":
                    params = {"project": c.project(), "card": card["id"], "reply": "", "parts": [
                        {"kind": "quote", "from": "main", "text": "le process"}, {"kind": "text", "text": words}]}
                r = c.rpc("card/answer", params)
                assert "error" not in r, r
                # inbox picks (3): the result is his answer as sb-core wrote it
                res = r.get("result", {}).get("answer", {})
                expect(res.get("agent") == "t3" and res.get("question", "").startswith(ask) and words in res.get("said", "")
                       and res.get("notice", "").startswith("you answered t3") and "pick" not in res, "card/answer's result (%s): %r" % (how, res))
            c.wait(lambda: not c.cards(), 30, "the card answered")
            sc = t.wait(words, 30)
            shot("card-answer-" + how)
            rows = sc.splitlines()
            i = max(k for k, row in enumerate(rows) if "you answered t3" in row)
            block = [rows[i]] + mine("\n".join(rows[i + 1:i + 6]))
            expect(not any(tg in row for row in block for tg in TAGS), "the answer's rows (%s): %r" % (how, block))
            expect(any("❝ le process" in row and "main · 1 line" in row for row in block), "its quote line (%s): %r" % (how, block))
            expect(any(words in row for row in block), "his words (%s): %r" % (how, block))
        print("ok: a card answer with a quote draws the quote line and his words")
    print("PASS tui msg parts")


if __name__ == "__main__":
    run(main)
