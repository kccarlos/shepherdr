#!/bin/bash
# vm/factory-vm-guest.sh: factory-vm.sh's guest side, run over ssh in a login shell (the keychain unlocked). Idempotent.
#   setup | status
# Everything here is the guest's own: its settings files, its repos under ~/dev, its herdr-core and service. The host's
# factory and the code paths it runs are never touched.
set -euo pipefail
cd
SRC=${SHEPHERDR_SRC:-$HOME/dev/shepherdr}             # the fork's kc-factory branch, installed from here
REPO=${SHEPHERDR_REPO:-https://github.com/kccarlos/shepherdr.git}
BRANCH=${SHEPHERDR_BRANCH:-kc-factory}
TRIAL=${FACTORY_FOLDER:-$HOME/dev/sheepdog-trial}     # the VM's factory folder: local only, no remote (ready opens no PR)
TRIAL_FROM=${TRIAL_FROM:-https://github.com/kccarlos/herdr-sheepdog}

json_merge() { # json_merge <file> <python expression on d>: edits a JSON file in place, made when missing
  python3 - "$1" "$2" <<'EOF'
import json, os, sys
path, expr = sys.argv[1], sys.argv[2]
try:
    d = json.load(open(path))
except (OSError, ValueError):
    d = {}
exec(expr, {"d": d, "os": os, "folder": os.environ.get("TRIAL")})
os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
open(path + ".new", "w").write(json.dumps(d, indent=2) + "\n")
os.replace(path + ".new", path)
EOF
}

checks() { # one line per CLI login and service
  for c in "claude:claude -p --model haiku 'Reply with the single word ok.'" \
           "agy:env -u SSH_CONNECTION -u SSH_CLIENT -u SSH_TTY agy --model gemini-3.8-flash-low -p='Reply with the single word ok.'" \
           "codex:codex exec --skip-git-repo-check 'Reply with the single word ok.'" \
           "gh:gh auth status --active 2>&1 | grep -m1 -o 'Logged in to [^ ]* account [^ ]*'"; do
    out=$(timeout 120 zsh -lc "${c#*:}" </dev/null 2>/dev/null | tail -1) || true
    printf '%-8s %s\n' "${c%%:*}" "${out:-FAILED}"
  done
  printf '%-8s %s\n' core "$(hc server status --json | jq -r '"hc \(.version), \(.live) live terminals"')"
  printf '%-8s %s\n' service "$(curl -s -o /dev/null -w 'http %{http_code} on 127.0.0.1:7788' http://127.0.0.1:7788/)"
  printf '%-8s %s\n' tailscale "$(tailscale status --json 2>/dev/null | jq -r 'if .BackendState == "Running" then "on, " + .Self.DNSName
    elif .AuthURL != "" then .BackendState + ": the person approves " + .AuthURL else .BackendState end' || echo 'not installed')"
  printf '%-8s %s\n' tasks "$(herdr-task config --folder "$TRIAL")"
}

case ${1:-} in
  setup)
    # herdr-core: a copied binary asks for `hc update` once before it counts as installed (releases.herdr.dev is blocked).
    if hc server status 2>&1 | grep -q 'hc update'; then cp .local/bin/herdr-core /tmp/hc-self && hc update --from /tmp/hc-self >/dev/null; fi

    # Shepherdr from the fork, installed with no question-card hooks (nothing here asks: permissions are skipped).
    mkdir -p "${SRC%/*}"
    [ -d "$SRC/.git" ] || git clone -q -b "$BRANCH" "$REPO" "$SRC" </dev/null
    git -C "$SRC" fetch -q origin "$BRANCH" </dev/null && git -C "$SRC" checkout -q "$BRANCH" && git -C "$SRC" merge -q --ff-only "origin/$BRANCH"
    (cd "$SRC" && ./install.sh --yes --no-hooks </dev/null | tail -4)

    # Permissions skipped, in the guest's own settings: Claude, Codex; agy and workers through Shepherdr's settings below.
    json_merge .claude/settings.json 'd.setdefault("permissions", {})["defaultMode"] = "bypassPermissions"; d["skipDangerousModePermissionPrompt"] = True'
    # Codex: any top-level approval_policy and sandbox_mode (before the first [table]) give way to never / full access.
    mkdir -p .codex; touch .codex/config.toml
    awk 'BEGIN {print "approval_policy = \"never\""; print "sandbox_mode = \"danger-full-access\""}
         /^[[:space:]]*\[/ {t = 1} !t && /^[[:space:]]*(approval_policy|sandbox_mode)[[:space:]]*=/ {next} {print}' \
      .codex/config.toml >.codex/config.toml.new && mv .codex/config.toml.new .codex/config.toml

    # The factory folder: a local clone (no remote, so ready never pushes or opens a pull request).
    if [ ! -d "$TRIAL/.git" ]; then git clone -q "$TRIAL_FROM" "$TRIAL" </dev/null && git -C "$TRIAL" remote remove origin; fi
    git -C "$TRIAL" config user.email >/dev/null ||
      { git -C "$TRIAL" config user.name factory-vm; git -C "$TRIAL" config user.email factory-vm@localhost; }
    herdr-task config --folder "$TRIAL" --prefix VMT >/dev/null

    # Claude's folder-trust prompt would stop every worker; with bypass as the default, a plan-mode Claude (the reviewer)
    # first asks once whether to make auto mode the default (answered here as "No, keep bypass permissions"). A repo with its own .claude/settings.json is asked about
    # by its root (a task's worktree too), so each repo under ~/dev is trusted by name, as the person would answer it.
    json_merge .claude.json 'import glob
d["hasSeenAutoDefaultNudge"] = True
p = d.setdefault("projects", {})
for f in [os.path.expanduser("~/dev")] + [g[:-5] for g in glob.glob(os.path.expanduser("~/dev/*/.git"))]:
    p.setdefault(f, {})["hasTrustDialogAccepted"] = True'

    # Shepherdr's settings: workers skip permissions (claude --dangerously-skip-permissions; for agy or codex workers the
    # perm is "full", which gives their skip flags), 4 tasks at once here. herdr-task's own reviewer is Claude (plan mode and its read-only allow list are fixed
    # in herdr-task's code): an agy reviewer runs in herdr-task's sandbox, which copies a token file this guest lacks (agy
    # signs in through the keychain here). Agy reviewers wait for a setting that skips that sandbox inside a VM.
    export TRIAL
    json_merge .herdr/shepherdr.json '
d["version"] = 1
e = d.setdefault("everywhere", {})
e["worker"] = {"agent": "claude", "perm": "bypassPermissions"}
e["reviewer"] = {"agent": "claude"}
e.setdefault("agents", {})["feedback"] = False
s = d.setdefault("spaces", {}).setdefault("factory", {})
s["folder"] = os.path.realpath(os.path.expanduser(folder))
s.setdefault("tasks", {}).update({"max_running": 4, "review_min": 1, "review_rounds": 3, "merge": "ask"})'

    # A Claude reviewer runs in plan mode and, told its shell runs only the read commands, never tries its verdict
    # command (on its allow list all the same): the guest's reviewer instructions say so. Shepherdr's updates then
    # leave this edited template alone and write their own beside it as reviewer.md.new.
    t=.config/herdr-core/templates/reviewer.md
    grep -q '# factory-vm verdict' "$t" ||
      echo '- In plan mode, your `herdr-task review` verdict command is on your allow list and runs without a prompt: run it to record your verdict. # factory-vm verdict' >>"$t"

    # Tailscale, so the board opens from the phone: the open-source daemon from Homebrew. Its login is the person's: the
    # checks print the link to approve until it's done.
    command -v tailscale >/dev/null || HOMEBREW_NO_AUTO_UPDATE=1 brew install -q tailscale </dev/null
    [ -e /Library/LaunchDaemons/com.tailscale.tailscaled.plist ] || { sudo tailscaled install-system-daemon; sleep 3; }
    if [ "$(tailscale status --json 2>/dev/null | jq -r '.BackendState + " " + .AuthURL')" = "NeedsLogin " ]; then
      (nohup tailscale up --hostname=factory-vm >/tmp/tailscale-up.log 2>&1 &); sleep 8
    fi

    # The service (launchd, from the install) and the scheduler (herdr-task keeps it under herdr-core).
    launchctl kickstart "gui/$(id -u)/dev.shepherdr.service" 2>/dev/null || true
    herdr-task scheduler --ensure >/dev/null
    checks ;;
  status)
    checks
    herdr-task list --folder "$TRIAL" ;;
  *) echo "factory-vm-guest.sh: setup | status" >&2; exit 2 ;;
esac
