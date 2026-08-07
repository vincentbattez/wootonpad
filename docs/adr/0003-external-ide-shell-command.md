# External IDEs are launched via a shell command template

Opening a Project in an External IDE could go through a per-IDE URL scheme (`vscode://file/…`, `jetbrains://web-storm/navigate/…`), which needs no `PATH` and executes nothing arbitrary. We launch a user-supplied command template instead (`externalIdeCommand`, e.g. `code {path}`), run through the user's login shell via `shell-profiles.js`, because only a freeform template supports an IDE we did not anticipate — which is the point of the feature — and only a real process gives us an exit code to report failure with.

## Consequences

The setting is arbitrary code executed on the user's machine. It is acceptable here only because it is user-authored in the settings panel, alongside the existing `preLaunchCmd`, which already has this property; it must never be populated from a `.jsonl`, from a file in the opened repository, or from anything else the user did not type.

Launching goes through a dedicated IPC channel that takes a `projectPath` and reads the command from settings in the main process. It does not widen `openExternal`, which is deliberately gated on `http(s)` in `main.js`.

Running through the login shell rather than spawning directly is what makes `code` resolvable at all: a GUI Electron app on macOS inherits a truncated `PATH`.

Because the template is assembled into a shell command line, quoting is the builder's job, not the user's: the substituted path is always quoted, so a template must not wrap `{path}` in quotes itself. Quoting style and WSL path translation both depend on the resolved shell, which is why the builder takes it as an argument.

The button hands over a Project folder only, never a single file — even though the MCP bridge already receives file-open calls and could supply one.

The template is user data. Moving later to a fixed list of known IDEs, or to URL schemes, would mean migrating everyone's stored command.

This applies only to *unpredictable* external targets. [ADR 0004](0004-native-open-for-predictable-targets.md) draws the line and takes the native API where the target is predictable.
