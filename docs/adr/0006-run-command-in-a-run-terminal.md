# A Project's Run Command runs in a Run Terminal, written into its shell

A Project's dev server could be started as a headless captured process, or handed to an external terminal like an External IDE is. We open a **Run Terminal** instead — a Plain Terminal on the existing internal PTY path, attached to the Project — because a headless process loses ANSI colour and the ability to answer an interactive prompt, and an external terminal would put the process outside the app, breaking the IDE-emulator promise the rest of the sidebar makes.

The command comes from a `runCommand` setting, resolved by the existing global / `project:<path>` merge, **empty by default**. It is never detected from `package.json`, a lockfile, or any manifest: a dev command is an unpredictable target, which [ADR 0003](0003-external-ide-shell-command.md) already answers with a user-authored template. Like `externalIdeCommand` and `preLaunchCmd`, it is arbitrary code, acceptable only because the user typed it into the settings panel.

The command is **written into the shell**, followed by a newline — not passed as a shell argument. That is what keeps the shell alive after Ctrl+C, leaves the command in history for the up arrow to restart, and removes quoting from the problem entirely: the user's text is sent verbatim.

A living Run Terminal is **focused, never restarted**. One whose shell has exited is **reused**: same tab, PTY respawned, command re-injected.

## Consequences

The Run Terminal is a distinct session type, not a Plain Terminal carrying a special summary: "does this Project already have a Run Terminal?" is then an exact lookup, and a summary the user can rename would be an identity made of chewing gum. The type also lets the tab carry its own icon.

The verdict is computed in the main process, which alone knows which PTYs are alive; the renderer holds a mirror it re-syncs from the backend on reload. Because `activeSessions` drops a session when its PTY exits, the Project → Run Terminal binding is kept in its own registry, which is what makes reuse-on-exit possible. Stopping a Run Terminal by hand clears that binding: the next click starts a fresh one.

The command rides along in the `claude` shim's existing deferred write rather than behind a second timer. Ordering is then guaranteed by construction, not by a race between delays, and the shim's `clear` leaves the run command as the first visible line.

A Worktree resolves its own `runCommand` by path, then the global — it never inherits its parent's. The settings model has exactly two levels and gains no third; two different merge rules in one panel would be the trap. If inheritance is ever wanted, it must be posed for all command settings at once.

There is no stop button and no restart action. A PTY does not report whether the server process is alive — the shell outlives the command — so any UI claiming to know would be lying. Restarting is Ctrl+C then the up arrow, inside the terminal.

Failure is `{ ok: false, reason }`, rendered as the same transient notification as Open Project Folder and Open in External IDE — [ADR 0004](0004-native-open-for-predictable-targets.md)'s rule that neighbouring buttons must not teach two error languages. The decision itself lives in `run-command.js`, a pure module in the shape of `external-ide.js`, so the three failure paths are covered without Electron.
