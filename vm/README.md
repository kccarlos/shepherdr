# Factory VM images

Layered Tart macOS images the factory reuses for GUI checks that don't need Xcode: the Herdr panel, the board, a fresh
install, a reboot. Xcode, simulators and the USB test iPhone stay on the host (faster; USB can't pass into a VM; one
queue for both), so there is no Xcode layer. Background: docs/factory.md, section 11a "Where each role runs".

```
sd-qa-base  ->  factory-base-<day>  ->  sheepdog-qa-<day>
(never changed)  common tools, PATH,    the sheepdog repo (public GitHub clone),
                 timeout, TCC grants    its Go modules and build cache
```

## Build

```sh
export TART_HOME=<the Tart folder on the external SSD>   # without it, tart list shows nothing
vm/provision.sh factory-base          # today's date; or: vm/provision.sh factory-base 2026-11-08
vm/provision.sh sheepdog-qa           # from the newest factory-base-<day>
vm/provision.sh smoke sheepdog-qa-2026-11-08
vm/provision.sh refresh factory-base-2026-11-08   # re-run a layer on an existing image, keeping its logins
```

- Each build clones its parent to `<layer>-build`, provisions it over ssh (`guest.sh`), snapshots it as `<layer>-<day>`,
  deletes the build VM, then runs the smoke test on a fresh clone. A failed smoke test deletes the new snapshot.
- An existing `<layer>-<day>` is left alone, so re-running is safe. To rebuild a day, `tart delete` it first.
- The CLIs (herdr-core/hc, herdr, claude, agy, codex, bun) and Herdr.app are copied from this Mac: the VM runs what the host
  runs. git, gh, Go, node, python and jq come with sd-qa-base. New needs go into the scripts, never into a hand-edited
  image.
- Herdr updates itself and herdr-core from `releases.herdr.dev`, which made a clone drift from its manifest within a
  boot. factory-base points that host at 0.0.0.0 in `/etc/hosts`; a check that installs Herdr from the internet
  removes that line in its own clone first.
- ssh uses `~/.ssh/tart_sdqa_ed25519` (override with `VM_KEY`); `tart exec` would skip `.zprofile`.

## Manifest

`~/.factory/manifest.tsv` inside each image, tab-separated, one layer appending to its parent's:

```
image  factory-base-2026-11-08  sd-qa-base  2026-11-08T21:40:00Z
tool   go  go version go1.27.3 darwin/arm64  go version
```

A `tool` line is its name, its version and the command whose first line printed that version. The `*-login` lines
hold only a login's state (`logged in`, `not logged in`), never a token or an account.

## Smoke test

On a fresh clone (proving it boots): every manifest command re-run under `zsh -l` prints the recorded version; the
PATH line is in both `.zprofile` and `.zshrc`; the TCC grants hold (osascript to System Events for Accessibility,
`screencapture` for Screen Recording); at least 8 GB of disk is free.

## Logins and grants

- The TCC grants (Accessibility, Screen Recording for Terminal and `sshd-keygen-wrapper`) come from sd-qa-base and
  survive in every clone.
- CLI logins may live in the image (the SSD stays attached to this Mac). Only the person does them:
  `vm/provision.sh login factory-base-<day>` opens a VM window; in its Terminal run `gh auth login`, `claude` (then
  `/login`), `codex` and `agy`, then Apple menu > Shut Down. A refresh follows: the manifest records the logins, the
  smoke test checks them on a fresh clone, then the image is swapped. Rebuild sheepdog-qa afterwards (delete it, run
  its build again) so it inherits them.
- The logins sit in the guest's login keychain, which is locked over ssh: a login shell (`zsh -l`) over ssh unlocks
  it (the base image's stock admin/admin account). agy over ssh reads a token file instead of the keychain, so run it
  as `env -u SSH_CONNECTION -u SSH_CLIENT -u SSH_TTY agy ...`.

## Using sheepdog-qa (one clone per run)

The gate verifier's commands, as run for the proof (boot to ssh took 19 s):

```sh
export TART_HOME=<the Tart folder on the external SSD>
vm=sdqa-run-$RUN_ID
key=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
     -o LogLevel=ERROR -i ~/.ssh/tart_sdqa_ed25519)
tart clone sheepdog-qa-2026-11-08 "$vm"
nohup tart run "$vm" --no-graphics >/dev/null 2>&1 &
for _ in $(seq 30); do ip=$(tart ip "$vm" 2>/dev/null) && ssh "${key[@]}" "admin@$ip" true && break; sleep 5; done
ssh "${key[@]}" "admin@$ip" 'zsh -lc "cd ~/herdr-sheepdog && git fetch -q && git checkout -q --detach <sha> && <the check>"'
tart stop "$vm"; tart delete "$vm"
```

Never run a job in a `factory-base-*` or `sheepdog-qa-*` image itself.
