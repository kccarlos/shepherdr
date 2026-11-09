#!/bin/bash
# vm/guest.sh: the guest side of provision.sh, run over ssh in the admin's home. Each step is idempotent.
#   base | sheepdog <repo url> | record <layer> <image> <parent> | smoke
set -euo pipefail
cd
M=.factory/manifest.tsv # image <name> <parent> <built>, then tool <name> <version> <command that prints it>

tools() { # each layer's manifest entries: name, then the command whose first line is its version
  case $1 in
    factory-base) cat <<'EOF'
git	git --version
gh	gh --version
go	go version
node	node --version
python3	python3 --version
bun	bun --version
jq	jq --version
hc	hc --version
herdr	herdr --version
herdr-app	codesign --verify ~/Applications/Herdr.app && defaults read ~/Applications/Herdr.app/Contents/Info CFBundleShortVersionString
claude	claude --version
agy	agy --version
timeout	timeout 5 echo works
codex	codex --version
gh-login	gh auth status >/dev/null 2>&1 && echo logged in || echo not logged in
claude-login	claude auth status --json 2>/dev/null | jq -r 'if .loggedIn then "logged in, " + .authMethod else "not logged in" end'
codex-login	codex login status >/dev/null 2>&1 && echo logged in || echo not logged in
agy-login	env -u SSH_CONNECTION -u SSH_CLIENT -u SSH_TTY timeout 60 agy models >/dev/null 2>&1 && echo logged in || echo not logged in
no-self-update	grep -c '^0.0.0.0 releases.herdr.dev' /etc/hosts
EOF
    ;;
    sheepdog-qa) cat <<'EOF'
herdr-sheepdog	git -C ~/herdr-sheepdog rev-parse HEAD
go-modules	cd ~/herdr-sheepdog && go mod verify
EOF
    ;;
  esac
}

case $1 in
  base)
    # Herdr would update itself and herdr-core from releases.herdr.dev, so every clone would drift from the manifest.
    grep -q releases.herdr.dev /etc/hosts || echo '0.0.0.0 releases.herdr.dev # factory: no self-updates' | sudo tee -a /etc/hosts >/dev/null
    pkill -x Herdr || true
    rm -rf Applications/Herdr.app.*
    go=$(basename "$(ls -d sdk/go* | tail -1)")
    for f in .zprofile .zshrc; do
      grep -q '# factory PATH' "$f" 2>/dev/null ||
        echo "export PATH=\"\$HOME/.local/bin:\$HOME/sdk/$go/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:\$PATH\" # factory PATH" >>"$f"
      # The CLIs keep their logins in the login keychain, locked over ssh; admin/admin is the base image's stock account.
      grep -q '# factory keychain' "$f" ||
        echo '[ -n "$SSH_CONNECTION" ] && security unlock-keychain -p admin ~/Library/Keychains/login.keychain-db 2>/dev/null # factory keychain' >>"$f"
    done
    cat >.local/bin/timeout <<'EOF'
#!/bin/sh
# timeout [opts] N[s] cmd...: macOS has no coreutils timeout; perl's alarm ends cmd after N seconds.
while case $1 in -k|-s|--kill-after|--signal) shift 2 ;; -*) shift ;; *) false ;; esac; do :; done
n=${1%s}; shift
exec perl -e 'alarm shift; exec @ARGV or die "timeout: $ARGV[0]: $!\n"' "$n" "$@"
EOF
    chmod 755 .local/bin/timeout
    ln -sf herdr-core .local/bin/hc
    # The project repo belongs to its own layer, not the common one.
    rm -rf herdr-sheepdog
    if [ -d go ]; then chmod -R u+w go; rm -rf go; fi
    ;;
  sheepdog)
    export PATH="$HOME/.local/bin:$(ls -d "$HOME"/sdk/go*/bin | tail -1):/opt/homebrew/bin:$PATH"
    [ -d herdr-sheepdog/.git ] || git clone -q "$2" herdr-sheepdog </dev/null
    cd herdr-sheepdog
    git fetch -q origin </dev/null && git checkout -q --detach origin/HEAD
    go mod download </dev/null && go build ./... </dev/null # modules and the build cache, warm
    ;;
  record) # (re)writes this layer's lines, so a refresh doesn't repeat them
    mkdir -p .factory && touch $M
    tools "$2" | cut -f1 >/tmp/factory-names
    awk -F'\t' 'NR==FNR {n[$1]; next} !($1 == "tool" && $2 in n)' /tmp/factory-names $M >$M.new && mv $M.new $M
    grep -q "^image	$3	" $M || printf 'image\t%s\t%s\t%s\n' "$3" "$4" "$(date -u +%FT%TZ)" >>$M
    tools "$2" | while IFS=$'\t' read -r name cmd; do # a failing or silent command fails the build
      out=$(zsh -lc "$cmd" </dev/null 2>&1) && [ -n "${out%%$'\n'*}" ] || { echo "record: $name failed: $out" >&2; exit 1; }
      printf 'tool\t%s\t%s\t%s\n' "$name" "${out%%$'\n'*}" "$cmd"
    done >>$M
    cat $M
    ;;
  smoke)
    fail=0
    [ -s $M ] || { echo "FAIL  no manifest at ~/$M"; exit 1; }
    while IFS=$'\t' read -r kind name want cmd; do
      if [ "$kind" = image ]; then echo "image $name (from $want, built $cmd)"; continue; fi
      got=$(zsh -lc "$cmd" </dev/null 2>&1) && got=${got%%$'\n'*} || got="exit $?: ${got%%$'\n'*}"
      if [ "$got" = "$want" ]; then echo "ok    $name: $got"; else echo "FAIL  $name: want '$want', got '$got'"; fail=1; fi
    done <$M
    for f in .zprofile .zshrc; do
      if grep -q '# factory PATH' $f; then echo "ok    PATH in $f"; else echo "FAIL  no factory PATH in $f"; fail=1; fi
    done
    if osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' >/dev/null 2>&1
    then echo "ok    Accessibility (osascript System Events)"; else echo "FAIL  Accessibility: osascript was refused"; fail=1; fi
    rm -f /tmp/smoke.png
    if screencapture -x /tmp/smoke.png 2>/dev/null && [ -s /tmp/smoke.png ]
    then echo "ok    Screen Recording (screencapture)"; else echo "FAIL  Screen Recording: screencapture failed"; fail=1; fi
    free=$(df -g / | awk 'NR==2 {print $4}')
    if [ "$free" -ge 8 ]; then echo "ok    disk: $free GB free"; else echo "FAIL  disk: $free GB free, the test kits need 8"; fail=1; fi
    exit $fail
    ;;
  *) echo "guest.sh: unknown step $1" >&2; exit 2 ;;
esac
