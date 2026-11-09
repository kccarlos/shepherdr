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

## factory-vm: the factory in a long-lived VM

`factory-vm` is a whole Shepherdr factory in one Tart guest (8 CPUs, 10 GB): herdr-core, Shepherdr installed from the
fork's `kc-factory` branch (`~/dev/shepherdr`), its service, and the CLIs logged in by factory-base. Unlike the images
above, it is long-lived: never delete it, and snapshot it before each big change. The host's own factory is untouched.

```sh
export TART_HOME=<the Tart folder on the external SSD>
vm/factory-vm.sh create            # clone the newest factory-base-<day> (never replaces an existing factory-vm)
vm/factory-vm.sh setup             # boot it and (re)run the guest setup over ssh: idempotent, ends with the checks
vm/factory-vm.sh start | stop      # headless boot, waits for ssh | sync, then stop
vm/factory-vm.sh snap <step>       # keep a copy as factory-vm-snap-<step> (stops it for the clone, restarts it)
vm/factory-vm.sh status            # state, address, the checks, the factory folder's tasks
vm/factory-vm.sh ssh 'herdr-task list --folder ~/dev/sheepdog-trial'   # any command, in a login shell
```

Each command first probes `TART_HOME` (30 s), so a missing SSD consent stops it with the fix instead of hanging.

What the guest setup (`factory-vm-guest.sh`) does, all in the guest's own files:
- Installs Shepherdr with `./install.sh --yes --no-hooks` (nothing asks there, so no question-card hooks).
- Permissions skipped: `~/.herdr/shepherdr.json` gives workers `perm: bypassPermissions` (Claude runs with
  `--dangerously-skip-permissions`; picking agy or codex there gives their skip flags); `~/.claude/settings.json` has
  `defaultMode: bypassPermissions`; `~/.codex/config.toml` has `approval_policy = "never"` and full access.
- Claude prompts that would stop an unattended run are answered once in `~/.claude.json`: each repo under `~/dev` is
  trusted by name (a repo with its own `.claude/settings.json` is asked about by its root, worktrees too), and the
  "make auto mode your default?" offer a plan-mode Claude shows next to a bypass default.
- The factory folder is `~/dev/sheepdog-trial` (tasks VMT-n, 4 at once, herdr-task's own reviewer with one passing
  round): a clone of herdr-sheepdog with no remote, so `ready` never pushes or opens a pull request. Repos live under
  `~/dev`, never `~/Documents`. Another repo: clone it into `~/dev`, add a `spaces` entry with its folder, rerun setup.
- The reviewer is Claude (plan mode with a read-only allow list: herdr-task's code fixes that, not settings). An agy
  reviewer runs in herdr-task's sandbox, which copies a token file this guest lacks (agy signs in through the keychain
  here); agy reviewers wait for a setting that turns that sandbox off inside a VM.
- Tasks start without a Herdr window: `herdr-task start <n> --space factory` (no Assistant: no parent terminal).

The host reaches it over plain ssh (`factory-vm.sh ssh`/`status`, the key above, the address from `tart ip`), never
with `hc machine add` against the host's live core: a linked machine gets the host window's settings pushed to it
and herdr-task's bundle copied on, which would replace the guest's settings.

After a reboot:
- Host: nothing starts factory-vm by itself. Run `vm/factory-vm.sh start` (needs the SSD's consent granted to the
  shell or, for a LaunchAgent, `/bin/bash`, as in the wiki's launchd notes).
- Guest: auto-login starts the Shepherdr service (its LaunchAgent), which starts herdr-core and, within about a minute,
  the scheduler (`herdr-automations`). Checked with a stop and start: the service answered and the scheduler came back.
  Agents that were running come back as shells (hc keeps them); bringing them back to work was not tried.

Limits: the host has 16 GB and Virtualization.framework runs at most two macOS guests, so factory-vm (10 GB) plus the
nightly's `sd-qa` (6 GB) fill the Mac mini, and a gate verifier's clone can't boot while both run. Stop factory-vm
for those, or give it less memory.

Still needs the person:
- Tailscale: installed in the guest (`brew install tailscale`, the system daemon) and waiting for its login link to be
  approved (an ask names it), so the board opens from the phone.
- Optionally a fine-grained GitHub token limited to the fork, replacing the guest's full `gh` login.
