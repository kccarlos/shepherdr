#!/bin/bash
# vm/factory-vm.sh: the long-lived factory VM, factory-vm: a whole Shepherdr factory in a Tart guest (vm/README.md).
#   factory-vm.sh create          clone factory-base-<newest day> into factory-vm (8 CPUs, 10 GB); never replaces it
#   factory-vm.sh start | stop    boot it headless and wait for ssh | sync, then stop it
#   factory-vm.sh snap <step>     stop, keep a copy as factory-vm-snap-<step>, start again if it was running
#   factory-vm.sh setup           (re)run the guest setup over ssh: Shepherdr from the fork, settings, services, checks
#   factory-vm.sh ssh [command]   a login shell in the guest (the keychain unlocks), or one command in one
#   factory-vm.sh status          state, address, the CLIs' logins and the factory's tasks
# Needs TART_HOME (the external SSD); its access is probed first (a consent prompt would hang an unattended run).
set -euo pipefail
: "${TART_HOME:?export TART_HOME first: the Tart images live on the external SSD}"
export TART_HOME PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
HERE=$(cd "$(dirname "$0")" && pwd)
VM=${FACTORY_VM:-factory-vm}
KEY=${VM_KEY:-$HOME/.ssh/tart_sdqa_ed25519}
SSHO=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -i "$KEY")

probe() { # the SSD answers within 30 s, or this stops with the fix (wiki env/tart-macos-vm.md)
  perl -e 'alarm 30; exec @ARGV' ls "$TART_HOME" >/dev/null 2>&1 || {
    echo "TART_HOME ($TART_HOME) didn't answer in 30 s: allow this shell (and /bin/bash for launchd) in System Settings >" \
      "Privacy & Security > Files and Folders or Full Disk Access" >&2; exit 1; }
}
has() { tart list --quiet | grep -qx "$1"; }
running() { tart list | awk -v n="$1" '$2 == n {print $NF}' | grep -qx running; }
g() { ssh "${SSHO[@]}" "admin@$(tart ip "$VM")" "$@"; }
up() {
  has "$VM" || { echo "no $VM: run '$0 create' first" >&2; return 1; }
  running "$VM" || { echo "booting $VM"; nohup tart run "$VM" --no-graphics >/dev/null 2>&1 & }
  for _ in $(seq 60); do
    if tart ip "$VM" >/dev/null 2>&1 && g true 2>/dev/null; then return; fi
    sleep 3
  done
  echo "$VM never answered ssh" >&2; return 1
}
down() { if running "$VM"; then g sync || true; tart stop "$VM"; fi; } # without sync, the last writes can be lost

probe
case ${1:-} in
  create)
    if has "$VM"; then echo "$VM exists: left as it is"; exit 0; fi
    base=$(tart list --quiet | grep -E '^factory-base-[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort | tail -1 || true)
    tart clone "${base:?no factory-base-<day> image: build it with vm/provision.sh}" "$VM"
    tart set "$VM" --cpu 8 --memory 10240
    echo "created $VM from $base" ;;
  start) up; echo "$VM is up at $(tart ip "$VM")" ;;
  stop) down ;;
  snap)
    snap=$VM-snap-${2:?which step? e.g. setup}
    if has "$snap"; then echo "$snap exists: left as it is"; exit 0; fi
    was=; running "$VM" && was=1
    down; tart clone "$VM" "$snap"; echo "kept $snap"
    if [ -n "$was" ]; then up; fi ;;
  setup)
    up
    g 'cat > /tmp/factory-vm-guest.sh' <"$HERE/factory-vm-guest.sh"
    g "zsh -lc 'bash /tmp/factory-vm-guest.sh setup'" ;;
  ssh) up; shift; if [ $# = 0 ]; then ssh -t "${SSHO[@]}" "admin@$(tart ip "$VM")" zsh -l; else g "zsh -lc $(printf %q "$*")"; fi ;;
  status)
    tart list | awk -v n="$VM" 'NR == 1 || $2 == n'
    if running "$VM"; then
      echo "address: $(tart ip "$VM")"
      g 'cat > /tmp/factory-vm-guest.sh' <"$HERE/factory-vm-guest.sh"
      g "zsh -lc 'bash /tmp/factory-vm-guest.sh status'"
    fi ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
