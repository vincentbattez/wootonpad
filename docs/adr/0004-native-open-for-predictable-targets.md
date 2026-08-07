# Predictable external targets use Electron's native open, not a shell template

Opening a Project Folder in the system file manager goes through `shell.openPath`, not through the user-supplied command template that [ADR 0003](0003-external-ide-shell-command.md) established for External IDEs.

The dividing line is whether the external target is **predictable**. An External IDE is not: we cannot know which editor the user wants, nor how it is launched, so the template — with its quoting, WSL translation and login shell — is the price of supporting an editor we did not anticipate. A file manager is the opposite: every desktop OS designates exactly one by default, and Electron already asks the OS for it. Cross-platform support comes for free, with no per-OS branch.

**The rule for the next external integration: predictable and uniform target → native API; unpredictable target → user-supplied template.** Reaching for the template by default, because ADR 0003 got there first, would import a shell pipeline to solve a problem that has none.

## Consequences

This path never executes user-authored code, unlike `externalIdeCommand` and `preLaunchCmd`. It adds no setting: choosing a different file manager would drag the whole quoting/WSL/login-shell pipeline back in for a need nobody has expressed.

`openPath` applied to a file launches that file's default application. The handler therefore refuses any path that is not a directory — an "open the folder" must never turn into "launch an app".

The handler lives inline in `main.js` next to the other IPC handlers: two filesystem checks and one Electron call carry no logic worth extracting. If it grows a per-platform branch or any path normalisation, extract a pure module and test it under `node:test`, as `external-ide.js` is.

Failure is reported in the same shape as the External IDE's — `{ ok: false, reason }` translated by the renderer into the same transient notification — because two neighbouring buttons must not teach two error languages.
