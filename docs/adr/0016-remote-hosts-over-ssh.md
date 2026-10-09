# Remote Hosts are addressed over plain SSH, and a prompt may never block the app

A Remote Host runs Sessions on another machine. WootonPad reaches it the way the user already
does from a terminal — there is no agent to install, no daemon to run, no port to open. The whole
transport is `ssh`, and `tmux` on the far side keeps a Session alive across reconnects. Anything the
user has made work by hand (an `~/.ssh/config` alias, a jump host, an agent-forwarded key) works
here unchanged, because it is the same `ssh`.

That choice carries one hard constraint: **no SSH prompt may ever block the app.** A GUI has no
terminal to answer a password or a host-key question, so a prompt would hang the probe, the Test
Connection button, and eventually the event loop. Every command WootonPad sends therefore runs with
`BatchMode=yes` — ssh fails fast instead of waiting on a password. As a second wall, the child is
spawned with `SSH_ASKPASS` disabled and no `DISPLAY`, so nothing can pop an askpass helper even if
`BatchMode` were somehow bypassed.

**The host key is never auto-accepted.** `StrictHostKeyChecking` is left at its default and is
*not* relaxed to `accept-new`. Trusting an unknown machine is a security decision that belongs to
the user, made once, by hand — `accept-new` would make it silently, for them, which is exactly the
decision we must not take. An unknown key surfaces as its own diagnosis ("connect once by hand to
review and accept it"), distinct from a refused key and from a plain unreachable Host.

**Commands run through a login shell** — `$SHELL -lc '…'`. A non-interactive SSH session inherits
none of the login PATH, so a Homebrew `tmux` or a user-installed `claude` is invisible without it.
The prerequisite checks (`command -v tmux`, `command -v claude`) and everything they gate run under
`$SHELL -lc` so they see the same PATH the user sees.

**The reachability probe rides a multiplexed master.** Each Host gets a stable `ControlPath` socket
(`ControlMaster=auto`, `ControlPersist`), so the 30-second probe reuses one connection instead of
paying a full handshake every time. The master lingers briefly after each use, which also makes a
Test Connection immediately after a probe cheap.

**Each Account is a config dir with its own `.oauth-token`.** An Account on a Host is just a Claude
config directory on that Host (the Default Account is `~/.claude`). Authentication is the
`.oauth-token` file *inside* that directory — not an environment variable. `CLAUDE_CODE_OAUTH_TOKEN`
is deliberately avoided: it would override the config dir and collapse every Account on a Host into
one identity. The Account prerequisite check reports, in one round trip, whether the dir is missing,
the token is missing, or the Account is ready.

## Consequences

The decision layer is a pure module (`remote-hosts.js`): SSH argument construction, the
prerequisite-to-diagnosis mapping, the reachability classifier, and the Host store transforms are
all functions of plain values, tested without a socket. The adapter around it
(`remote-hosts-ipc.js`) is the only part that shells out, persists, and runs the timer.

Because `BatchMode=yes` is the entire safety story, it is asserted by a test on *every* generated
argument vector, alongside a test that `accept-new` and `StrictHostKeyChecking=no` never appear.

A Host's `sshTarget` and an Account's `configDir` are data the renderer could have forged, so both
are validated in the main process before they are stored or interpolated: a target may not begin
with a dash (it would be read as an ssh option — local command execution), and a config dir is
restricted to a plain path so it cannot break out of the remote shell script it is spliced into.

The reachability badge is eventually consistent, not live: a Host that goes down or comes back is
reflected within one probe interval, and the badge distinguishes Checking (not yet probed) from
Reachable and Unreachable.
