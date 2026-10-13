#!/bin/bash
# The candidate-only as-he-does run (ambient-lead m_20081): his own promoted app may be running, so
# nothing here is addressed by bundle id or by name (no desktop-try.sh, no osascript, no pkill). The
# candidate's own path is opened with --real's stand-in env (HOME/BISE_HOME under ~/.bise/gate,
# BISE_DESKTOP_OFFSCREEN=1, a localhost CDP port), and only its own pids, found by its executable
# path, are stopped or restarted (SIGTERM, then wait). His app's pids are logged before and after:
# unchanged is part of the proof. Gates as run.sh (A front app, B his Library, C TCC + a helper under
# the candidate's path), each a kill of the run's own pids at its first breach.
#   cand.sh <out dir> <candidate app>
set -u
O=${1:?out dir}; A=${2:?candidate app}; mkdir -p "$O"
# the RESOLVED path (ambient-lead m_20102): ~/.bise/dev/build is a symlink to
# ~/.local/state/switchboard/build and the processes carry the resolved one, so a lookup by the
# given path missed the main process and the stop left 4 processes (724c0bb9's first run)
A=$(cd "$A" && pwd -P) || { echo "no $2"; exit 2; }
P=${AS_HE_DOES_PYTHON:-$HOME/.pyenv/versions/3.11.13/bin/python3}
HERE=$(cd "$(dirname "$0")" && pwd); T=$(cd "$HERE/../../../.." && pwd)
RS="$P -B $HERE/../realshape.py"
G=$HOME/.bise/gate/real-shape; H=$G/w/h
# AS_HE_DOES_FAKE_VOICE=1: the candidate's core hears the words written to $VOICE (fake.rs: its
# BISE_HOME is under ~/.bise/gate, never his), for dict1.mjs' ctrl+r take
VOICE=$G/voice-cand.txt; FV=()
[ "${AS_HE_DOES_FAKE_VOICE:-}" = 1 ] && { : > "$VOICE"; FV=(--env "BISE_AMBIENT_FAKE_VOICE=$VOICE"); export AS_HE_DOES_VOICE=$VOICE; }
HIS="$HOME/.bise/dev/try-src/apps/desktop/dist/mac-arm64/bise try.app"
# its main executable from its own Info.plist (amb-mac fb2e544f: candidates are "bise cand.app")
EXE=$([ -f "$A/Contents/Info.plist" ] && /usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$A/Contents/Info.plist" 2>/dev/null)
MAIN="$A/Contents/MacOS/${EXE:-bise try}"
PORT_CDP=9341
export PW_FROM=$T/apps/desktop
say() { echo "$(date +%T) $*"; }
case "$A" in "$HIS"|"$HIS/"*) echo "that's his promoted app, not a candidate"; exit 2;; esac
[ -x "$MAIN" ] || { echo "no $MAIN"; exit 2; }
case "$G" in "$HOME/.bise/gate/"*) ;; *) echo "the world must be under ~/.bise/gate"; exit 2;; esac
# its own bundle id (ambient-lead m_20669): with his app's id, LaunchServices can route a quit,
# activate or open between his app and ours (7e691aef's rerun: his quit took the candidate too)
CAND_ID=$([ -f "$A/Contents/Info.plist" ] && /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$A/Contents/Info.plist" 2>/dev/null)
HIS_ID=$([ -f "$HIS/Contents/Info.plist" ] && /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$HIS/Contents/Info.plist" 2>/dev/null)
[ -n "$CAND_ID" ] && [ "$CAND_ID" != "$HIS_ID" ] || { echo "the candidate's bundle id ($CAND_ID) is his app's ($HIS_ID): build it with its own id"; exit 2; }
HISR=$(cd "$HIS" 2>/dev/null && pwd -P || echo "$HIS")
# pids by fixed strings on the process table (no regex on a path with spaces and dots)
# (the awk itself carries the string: skipped; ps shows it as 'awk -v p <path>', no '=': every
# 'stop left 1 + 1' of c28260a9's runs was this awk counting itself)
pidsunder() { ps -axo pid=,command= | awk -v p="$1" 'index($0, p) && index($0, "awk -v p") == 0 { print $1 }'; }
hispids() { { pidsunder "$HIS/Contents/"; pidsunder "$HISR/Contents/"; } | sort -nu | tr '\n' ' '; }
ours() { pidsunder "$A/Contents/" | sort -nu; }
mainpid() { ps -axo pid=,command= | awk -v m="$MAIN" '{ pid = $1; sub(/^ *[0-9]+ /, ""); if ($0 == m || index($0, m " ") == 1) { print pid; exit } }'; }
killpids() { for p in "$@"; do kill -"${SIG:-TERM}" "$p" 2>/dev/null; done; }
# hubs outside the app (amb-mac e043678b, ambient-lead m_21810 (a)): every hub, REPL and plugin bridge
# the candidate starts runs from <prefix>/versions/<id>/bise, never from inside the bundle; only its
# main, its Electron helpers and ambient-core do. After the app quits: nothing from the bundle, its
# hubs live on. Read only (ps); one step per check in $O/hubs-steps.jsonl, hubs-outside.json at the end.
hubstep() { jq -cn --arg n "$1" --argjson ok "$2" --arg i "$3" '{name: $n, ok: $ok, info: $i}' >> $O/hubs-steps.jsonl; }
psall() { ps -axww -o pid=,command= | awk -v p="$1" 'index($0, p) && index($0, "awk -v p") == 0' | cut -c1-400; }
hubsnow() { # <when>: while the app runs
  local b other hubs bad good repls
  b=$(psall "$A/Contents/")
  # 'bise pty' is the terminal panel's shell host (main's child, gone at quit), not a hub/REPL/bridge
  other=$(echo "$b" | grep -v '^$' | grep -vF "$A/Contents/MacOS/" | grep -vF "$A/Contents/Frameworks/" | grep -vF " ambient-core" | grep -vF "$A/Contents/Resources/bin/bise pty ")
  hubs=$(psall "$G/w" | grep -F ' sbd --workspace ')
  bad=$(echo "$hubs" | grep -F "$A/Contents/")
  good=$(echo "$hubs" | grep -F '/versions/' | grep -vF "$A/Contents/")
  repls=$(ps -axww -o pid=,command= | grep -F 'repl-live' | grep -v grep | cut -c1-300)
  { echo "== $1 $(date +%T)"; echo "-- from the bundle:"; echo "$b"; echo "-- world hubs:"; echo "$hubs"; echo "-- repl-live:"; echo "$repls"; } >> $O/hubs-outside.txt
  hubstep "$1: only main, its helpers and ambient-core run from the bundle (no hub, REPL or plugin bridge)" "$([ -z "$other" ] && echo true || echo false)" "$(echo "$b" | grep -vc '^$') from the bundle; others: ${other:-none}"
  hubstep "$1: the candidate's hubs run from versions/<id>/bise (at least one, none from the bundle)" "$([ -z "$bad" ] && [ -n "$good" ] && echo true || echo false)" "from versions: $(echo "$good" | grep -vc '^$'); from the bundle: $(echo "$bad" | grep -vc '^$'); exes: $(echo "$hubs" | sed -n 's/^ *[0-9]* \(.*\) sbd --workspace .*/\1/p' | sort | uniq -c | tr '
' ';')"
  hubstep "$1: no repl-live from the bundle" "$(echo "$repls" | grep -qF "$A/Contents/" && echo false || echo true)" "$(echo "$repls" | grep -vc '^$') repl-live in all; from the bundle: $(echo "$repls" | grep -cF "$A/Contents/")"
}
hubsafter() { # <when>: the app's processes just ended, the world's not yet stopped
  local b hubs
  b=$(psall "$A/Contents/"); hubs=$(psall "$G/w" | grep -F ' sbd --workspace ' | grep -F '/versions/')
  { echo "== $1 after quit $(date +%T)"; echo "-- from the bundle:"; echo "$b"; echo "-- world hubs from versions:"; echo "$hubs"; } >> $O/hubs-outside.txt
  hubstep "$1: after the app quit, 0 processes from the bundle while its hubs live on" "$([ -z "$b" ] && [ -n "$hubs" ] && echo true || echo false)" "from the bundle: $(echo "$b" | grep -vc '^$'); its hubs alive: $(echo "$hubs" | grep -vc '^$')"
}
# stop: SIGTERM to the candidate's main process (Electron: app.quit -> will-quit, as an Apple Event
# quit), wait for every process under its path to go, then SIGTERM, then SIGKILL what stays; then the
# world's own processes (its hubs), by pid
stopcand() {
  local m; m=$(mainpid)
  [ -n "$m" ] && kill -TERM "$m" 2>/dev/null
  for i in $(seq 60); do [ -z "$(ours)" ] && break; sleep 0.5; done
  # (a): the app is gone, its hubs not yet stopped
  [ -z "$(ours)" ] && hubsafter "stop ${STOPN:=0}" && STOPN=$((STOPN + 1))
  killpids $(ours); sleep 2; SIG=KILL killpids $(ours)
  local w; w=$(pidsunder "$G/w")
  [ -n "$w" ] && killpids $w; sleep 1
  w=$(pidsunder "$G/w"); [ -n "$w" ] && { sleep 2; SIG=KILL killpids $w; sleep 1; }
  # a process seen in the count can be gone a moment later (c28260a9's runs: 1 + 1 left, nothing
  # by the time ps named them): counted again for up to 10 s, named at the first nonzero count
  local lc lw left=""
  for i in $(seq 20); do
    lc=$(ours | wc -l | tr -d ' '); lw=$(pidsunder "$G/w" | wc -l | tr -d ' ')
    [ "$lc" = 0 ] && [ "$lw" = 0 ] && break
    [ -z "$left" ] && left=$(ps -o pid=,ppid=,stat=,etime=,command= -p "$(echo $(ours) $(pidsunder "$G/w") | tr ' ' ',')" 2>/dev/null | cut -c1-240)
    sleep 0.5
  done
  [ -n "$left" ] && echo "$left" > $O/left-$(date +%H%M%S).txt
  say "stopped: left under the candidate $lc, naming the world $lw"
  [ "$lc" = 0 ] && [ "$lw" = 0 ] || {
    # which ones (c28260a9's first run left 1 + 1 that were gone a minute later: say what they were)
    { echo "the stop left $lc + $lw processes (10 s after)"; echo "$left"; ps -o pid=,ppid=,stat=,etime=,command= -p "$(echo $(ours) $(pidsunder "$G/w") | tr ' ' ',')" 2>/dev/null | cut -c1-240; } > $O/BREACH
    cat $O/BREACH; return 1; }
}
opencand() {
  open -g -n -a "$A" --env HOME=$H --env BISE_HOME=$H/.bise --env BISE_DESKTOP_OFFSCREEN=1 ${FV[@]+"${FV[@]}"} \
    --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=$PORT_CDP
  for i in $(seq 120); do [ -n "$(mainpid)" ] && break; sleep 0.25; done
  say "open: $A ($(grep commit= "$A/Contents/Resources/bin/VERSION")), pid $(mainpid), home $H/.bise"
}
endrun() { touch $O/stop; kill $TPID $NPID $CPID $CCPID 2>/dev/null; kill $(cat $G/fake/fake.pid) 2>/dev/null; }
breach() { [ -e $O/BREACH ] && { say "BREACH: $(cat $O/BREACH)"; stopcand; endrun; say "his app after: $(hispids)"; exit 3; }; }
# gate B with attribution (ambient-lead m_20102): a change in his real userData while HIS app runs
# is read with lsof (read only) on the candidate's pids: any open file under his folder = ours, kill
# as before; none = his own app's write, logged, the run goes on. Anything else changed = kill.
HISDATA="$HOME/Library/Application Support/bise try"
CANDPREF="$HOME/Library/Preferences/$CAND_ID.plist"
libgate() {
  local out; out=$($RS libsnap --out $O/after-$1.json --diff $O/before.json) && return 0
  echo "$out"
  # (the folder's own line counts as his userData too: run 4 stopped on it)
  # the candidate's OWN preferences domain is allowed and logged (main m_20867: Chromium writes 3 keys
  # through cfprefsd at startup, under his real home whatever HOME is); deleted at the run's end
  echo "$out" | sed -n 's/^  //p' | grep -xF "$CANDPREF" | sed "s|^|$1 |" >> $O/cand-prefs.txt
  local other; other=$(echo "$out" | sed -n 's/^  //p' | grep -vxF "$CANDPREF" | grep -vF "$HISDATA/" | grep -vxF "$HISDATA" | grep -v '^$')
  local his; his=$(echo "$out" | sed -n 's/^  //p' | grep -vxF "$CANDPREF" | grep -v '^$')
  if [ -z "$his" ]; then
    say "library $1: only the candidate's own $CANDPREF (allowed, logged)"
    cp $O/after-$1.json $O/before.json
    return 0
  fi
  if [ -z "$other" ] && [ -n "$(hispids)" ]; then
    local pids; pids=$(sort -u $O/pids.txt | tr '\n' ',' | sed 's/,$//')
    local ourfd; ourfd=$([ -n "$pids" ] && lsof -n -P -Fn -p "$pids" 2>/dev/null | sed -n 's/^n//p' | grep -F "$HISDATA/")
    if [ -z "$ourfd" ]; then
      say "library $1: only his userData changed while his app runs, no candidate fd there: his app's write, logged"
      echo "$1 $(echo "$out" | head -1)" >> $O/his-writes.txt
      cp $O/after-$1.json $O/before.json
      return 0
    fi
    echo "$ourfd" > $O/our-fds-$1.txt
  fi
  echo "library $1" > $O/BREACH; breach
}
# the candidate's own preferences domain, at the end of every mode (the quick one too: cand-e91f98d7
# run): through cfprefsd first (it caches and writes back); an emptied domain can leave its file as
# '{}' (run 40fc444d): only then rm it, and check after ~5 s that cfprefsd didn't write it back.
# cfprefsd itself is never touched (ambient-lead m_20883)
candprefs() {
  defaults delete "$CAND_ID" > $O/cand-prefs-delete.txt 2>&1; echo "rc=$?" >> $O/cand-prefs-delete.txt
  if [ -e "$CANDPREF" ]; then say "cand prefs: 'defaults delete $CAND_ID' done, the file is still there ($(stat -f %z "$CANDPREF") bytes, $(plutil -p "$CANDPREF" 2>/dev/null | tr -d '[:space:]'))"
  else say "cand prefs: 'defaults delete $CAND_ID' done, the file is gone"; fi
  if [ -e "$CANDPREF" ] && [ "$(plutil -p "$CANDPREF" 2>/dev/null | tr -d '[:space:]')" = "{}" ]; then
    rm -f "$CANDPREF"; sleep 5
    if [ -e "$CANDPREF" ]; then say "cand prefs: the empty $CANDPREF came back after rm: left, logged"
    else say "cand prefs: empty after the delete: rm'd, still gone after 5 s"; fi
  fi
  grep 'cand prefs:' $O/run.out 2>/dev/null >> $O/cand-prefs.txt
}
# the candidate's userData in the world (userdata.ts standInPaths: HOME is the world's): window-frame.json
drive() { AS_HE_DOES_USERDATA="$H/Library/Application Support/$(basename "$A" .app)" AS_HE_DOES_TAG=${TAG:-} node $HERE/driver.mjs $PORT_CDP $O "$@" > $O/driver-$1${TAG:+-$TAG}.log 2>&1; tail -4 $O/driver-$1${TAG:+-$TAG}.log; breach; }

rm -f $O/BREACH $O/stop $O/pids.txt $O/hubs-steps.jsonl $O/hubs-outside.txt
say "his app before: $(hispids)" | tee $O/his.txt
$RS libsnap --out $O/before.json
$RS build | tail -8
# every model request in a line (the quote row reads it), in the world, never /tmp's default
export FAKE_LOG=$G/fake/requests.jsonl AS_HE_DOES_FAKE_LOG=$G/fake/requests.jsonl
mkdir -p $G/fake; : > $FAKE_LOG; ($P -u $T/tests/fake_provider.py 0 > $G/fake/fake.out 2> $G/fake/fake.err & echo $! > $G/fake/fake.pid)
for i in $(seq 30); do grep -q PORT $G/fake/fake.out 2>/dev/null && break; sleep 0.3; done
PORT=$(awk '/PORT/{print $2}' $G/fake/fake.out); say "fake provider port $PORT"
cat >> $H/.bise/config.toml <<TOML
[roles]
main = "fake/mistral-small-latest"
classify = "off"

[providers.fake]
name = "fake"
api = "openai-chat"
base_url = "http://127.0.0.1:$PORT/v1"
key_env = "BISE_TRY_FAKE_KEY"
key_command = "echo fake-key"
small_model = "mistral-small-latest"
TOML
# three saved rules, so settings › approvals has a list to walk (d0d45f92's rows; rules.rs's format)
[ -e $H/.bise/approvals.toml ] || cat > $H/.bise/approvals.toml <<TOML
[[allow]]
tool = "bash"
pattern = "cargo test *"

[[allow]]
tool = "bash"
pattern = "pnpm check"

[[allow]]
tool = "bash"
pattern = "ls *"
TOML
log stream --style compact --predicate 'process == "tccd"' > $O/tccd.log 2>&1 & TPID=$!
log stream --level debug --style ndjson --predicate 'process == "tccd" OR subsystem == "com.apple.TCC"' > $O/tcc-debug.ndjson 2>&1 & NPID=$!
touch $O/pids.txt
( while [ ! -e $O/stop ]; do
    ours >> $O/pids.txt 2>/dev/null
    h=$(pgrep -f "$A/Contents/MacOS/bise-mac-helper")
    [ -n "$h" ] && { echo "helper $h" > $O/BREACH; SIG=KILL killpids $(sort -u $O/pids.txt); }
    sleep 0.3
  done ) & CPID=$!
$RS tcc --log $O/tccd.log --pids $O/pids.txt --kill-pids --stop-file $O/stop --bundle "$A" --out $O & CCPID=$!
$RS front --out $O/front.jsonl --stop-file $O/stop --bundle "$A" --pids $O/pids.txt & FPID=$!
sleep 1

# first launch: the passes, this cut's rows, then the draft across two restarts (SIGTERM)
say "launch first"; opencand; breach; libgate first-open
if [ "${AS_HE_DOES_ONLY:-}" = quick ]; then
  # a follow-up pass (ambient-lead m_22430): the quick rows, then one real ctrl+r take with the
  # fake voice (AS_HE_DOES_FAKE_VOICE=1), then the usual stop and gates
  drive quick
  if [ -n "${FV:-}" ]; then
    AS_HE_DOES_VOICE=$VOICE node $HERE/dict1.mjs $PORT_CDP $O > $O/driver-dict1.log 2>&1; tail -4 $O/driver-dict1.log; breach
  fi
  L=$(find "$H" -name core.log -newer $O/before.json -not -path "*/.bise/hubs/*" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
  [ -n "$L" ] && cp "$L" $O/core-first.log
  stopcand; breach; libgate first-stop
  touch $O/stop; wait $FPID $CCPID; kill $TPID $NPID $CPID 2>/dev/null
  kill $(cat $G/fake/fake.pid) 2>/dev/null
  w=$(ps -axo pid=,command= | grep -F "$G/w" | grep -v grep | awk '{print $1}'); [ -n "$w" ] && killpids $w
  candprefs
  libgate final
  say "his app after: $(hispids)" | tee -a $O/his.txt
  say "done (quick)"; exit 0
fi
drive first
drive cut
drive rows2
hubsnow "after rows2"
for c in pause atonce; do
  TAG=$c drive draft-type "draft kept across a restart ($c)"
  [ $c = pause ] && sleep 5
  m=$(mainpid)
  [ -z "$m" ] && { say "CANDIDATE GONE: its main process ended before the restart $c"; echo "restart-$c" >> $O/candidate-gone.txt; }
  say "restart $c (SIGTERM to ${m:-nothing}, then open)"; t0=$(date '+%Y-%m-%d %H:%M:%S')
  stopcand; breach; libgate restart-$c-stop
  opencand; breach; libgate restart-$c-open
  TAG=$c drive draft-check "draft kept across a restart ($c)"
done
L=$(find "$H" -name core.log -newer $O/before.json -not -path "*/.bise/hubs/*" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
if [ -n "$L" ]; then say "core.log at $L: $(wc -c < "$L") bytes, repl-live not found: $(grep -c 'repl-live not found' "$L")"; cp "$L" $O/core-first.log
else say "core.log: none under $H"; fi
# whether the world held a signed thought at all (else the BENDSIG row proves only the plain case)
say "signed thoughts in the world's hubs: $(grep -rl 'BENDSIG::' $H/.bise/hubs 2>/dev/null | wc -l | tr -d ' ') files"
say "hubs: $(ls $H/.bise/hubs/ | tr '\n' ' ')"
stopcand; breach; libgate first-stop

say "launch second"; opencand; breach; libgate second-open
drive second
stopcand; breach; libgate second-stop

touch $O/stop; wait $FPID $CCPID; kill $TPID $NPID $CPID 2>/dev/null
kill $(cat $G/fake/fake.pid) 2>/dev/null
say "realshape core with no env"
$RS core --bundle "$A" --out $O/core-noenv 2>&1 | tail -10
w=$(ps -axo pid=,command= | grep -F "$G/w" | grep -v grep | awk '{print $1}'); [ -n "$w" ] && killpids $w
candprefs
libgate final
[ -s $O/hubs-steps.jsonl ] && jq -s '{mode: "hubs-outside", steps: .}' $O/hubs-steps.jsonl > $O/hubs-outside.json
say "his app after: $(hispids)" | tee -a $O/his.txt
say "done"
