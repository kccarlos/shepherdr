#!/bin/bash
# vm/provision.sh: build the factory's layered Tart images, one layer at a time (vm/README.md).
#   provision.sh factory-base [day]   sd-qa-base             -> factory-base-<day>
#   provision.sh sheepdog-qa [day]    newest factory-base-*  -> sheepdog-qa-<day>
#   provision.sh smoke <image>        a fresh clone boots; its manifest's tools, PATH and TCC grants check out
#   provision.sh refresh <image>      re-run its layer and manifest in place (keeps its logins), smoke, swap
#   provision.sh login <image>        a window for the person's CLI logins first, then a refresh
# An existing <layer>-<day> is left as it is, so re-running is safe. Needs TART_HOME (the external SSD).
set -euo pipefail
: "${TART_HOME:?export TART_HOME first: the Tart images live on the external SSD}"
export TART_HOME PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
HERE=$(cd "$(dirname "$0")" && pwd)
KEY=${VM_KEY:-$HOME/.ssh/tart_sdqa_ed25519}
SSHO=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -i "$KEY")
VM='' TEMP=''

g() { ssh "${SSHO[@]}" "admin@$(tart ip "$VM")" "$@"; }
# A guest step: guest.sh is copied in first (bash -s would let the step's commands eat the script from stdin).
step() { g 'cat > /tmp/factory-guest.sh' <"$HERE/guest.sh" && g "bash /tmp/factory-guest.sh $*"; }
has() { tart list --quiet | grep -qx "$1"; }
cleanup() { if [ -n "$TEMP" ]; then tart stop "$TEMP" >/dev/null 2>&1 || true; tart delete "$TEMP" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

fresh() { # fresh <image> <vm>: a new clone to work in, deleted on exit unless kept
  VM=$2 TEMP=$2
  if has "$2"; then tart stop "$2" >/dev/null 2>&1 || true; tart delete "$2"; fi
  tart clone "$1" "$2"
}
boot() {
  nohup tart run "$VM" --no-graphics >/dev/null 2>&1 &
  for _ in $(seq 60); do
    sleep 3
    if tart ip "$VM" >/dev/null 2>&1 && g true 2>/dev/null; then return; fi
  done
  echo "$VM never answered ssh" >&2; return 1
}
done_with() { tart stop "$VM" >/dev/null 2>&1 || true; tart delete "$VM"; TEMP=''; }

put() { # put <host file> <guest path in the home>: copied (symlinks followed) when its sha256 differs
  local sum; sum=$(shasum -a 256 <"$1" | cut -c1-64)
  [ "$(g "cat $2 2>/dev/null | shasum -a 256 | cut -c1-64")" = "$sum" ] && return
  echo "copy $2"; g "mkdir -p ${2%/*} && cat >$2.new && chmod 755 $2.new && mv $2.new $2" <"$1"
}
app() { # the host's Herdr.app (only the app: no staged update beside it), when its version differs
  local info=Applications/Herdr.app/Contents/Info v
  v=$(defaults read "$HOME/$info" CFBundleShortVersionString)
  [ "$(g "defaults read ~/$info CFBundleShortVersionString 2>/dev/null" || true)" = "$v" ] && return
  echo "copy Herdr.app $v"; tar -C "$HOME/Applications" -cf - Herdr.app | g 'rm -rf Applications/Herdr.app && tar -C Applications -xf -'
}

# The layers. The CLIs come from this Mac (all standalone arm64), so the VM runs what the host runs.
layer_factory_base() {
  step base
  for b in herdr-core herdr claude agy codex; do put "$HOME/.local/bin/$b" ".local/bin/$b"; done
  put "$(command -v bun)" .local/bin/bun
  app
}
layer_sheepdog_qa() { step sheepdog "${SHEEPDOG_REPO:-https://github.com/kccarlos/herdr-sheepdog}"; }

build() { # build <layer> <parent image>
  local snap=$1-$DAY
  if has "$snap"; then echo "$snap exists: left as it is"; return; fi
  echo "building $snap from $2"
  fresh "$2" "$1-build"; boot
  "layer_${1//-/_}"
  step record "$1" "$snap" "$2"
  g sync; tart stop "$VM"; tart clone "$VM" "$snap"; done_with # without sync, the last writes can be lost
  if ! smoke "$snap"; then tart delete "$snap"; echo "smoke test failed: $snap deleted" >&2; exit 1; fi
  echo "built $snap"
}
smoke() { # smoke <image>
  local rc=0
  echo "smoke test of $1 on a fresh clone"
  fresh "$1" "$1-smoke" && boot && step smoke || rc=$?
  done_with; return $rc
}

case ${1:-} in
  factory-base) DAY=${2:-$(date +%F)}; build factory-base sd-qa-base ;;
  sheepdog-qa)
    DAY=${2:-$(date +%F)}
    base=$(tart list --quiet | grep -E '^factory-base-[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort | tail -1 || true)
    build sheepdog-qa "${base:?no factory-base-<day> image: build it first}" ;;
  smoke) smoke "${2:?which image?}" ;;
  refresh|login)
    img=${2:?which image?} edit=${2}-edit layer=${2%-*-*-*}
    fresh "$img" "$edit"
    if [ "$1" = login ]; then
      echo "In the VM window: open Terminal, run gh auth login, claude (then /login), codex and agy; then Apple menu > Shut Down."
      tart run "$edit"
    fi
    boot; "layer_${layer//-/_}"; step record "$layer" "$img" -
    g sync; tart stop "$VM"
    if ! smoke "$edit"; then tart delete "$edit"; echo "smoke test failed: $img left as it was" >&2; exit 1; fi
    tart delete "$img"; tart rename "$edit" "$img" ;;
  *) sed -n '2,7p' "$0"; exit 2 ;;
esac
