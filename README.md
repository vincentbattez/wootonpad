# Wooton Pad

> **Fork of [Switchboard](https://github.com/doctly/switchboard)** — extended with multi-account support, git integration, and a project viewer panel.

---

## What this fork adds

This repo forks [fortael/wootonpad](https://github.com/fortael/wootonpad). On top of it:

- **Areas** — Group projects into nestable containers in the sidebar. File them by drag and drop, rename, delete, give one a custom image. Collapse state survives restarts and search reaches inside.
- **Light mode** — A real light / dark / system theme across the whole app, terminal and editor included, plus a neutral-tone selector.
- **Open in External IDE** — One click from the sidebar opens a project in your own editor, via a command you configure.
- **Open Project Folder** — One click opens a project — or a worktree — in Finder, Explorer, or your Linux file manager. Nothing to configure.
- **Run Project** — One click starts your dev server in a Run Terminal beside your Claude sessions, on a command you configure per project. Clicking again reveals it rather than restarting it; Ctrl+C then the up arrow is the restart.
- **Descriptive session titles** — A session is titled by its goal, not its first prompt. The `ai-title` Claude Code writes is promoted to the displayed title; sessions without one keep a first prompt that is sanitised at ingestion — harness markup stripped, the first useful line kept instead of a raw 120-character cut. The first prompt drops to the terminal header subtitle. Applies to old and archived sessions alike; no LLM is called.
- **Remote Hosts** — The Accounts tab is a Host → Accounts tree: the Local Host first, then Remote Hosts you reach over SSH. Each shows its SSH target, a live Reachable / Unreachable badge probed in the background, and its Accounts. **Test connection** walks the prerequisites in order — SSH with key auth, a known host key, `tmux` and `claude` on the login PATH, each Account's `configDir` and `.oauth-token` — and stops at the first failure with the exact command to fix it. No password or host-key prompt can ever block the app.
- **Remote Projects** — Every Claude project on a Remote Host shows in the sidebar with a server badge tooltipped by the Host's name, right beside your local projects. Its active Account's sessions are mirrored down with `rsync` on a poll, so a new conversation on the Host appears within one interval; you can read its JSONL and full-text-search it like any local session. A project with the same path on two machines stays two distinct rows, worktrees nest under their project, and when the Host goes Unreachable its projects grey out while their cache is kept — nothing disappears. A project where Claude never ran has no folder to mirror, so **Add Project** lets you pick a Remote Host and type a path: it's validated on the Host as an existing directory, then appears at once and stays even before its first session. Each Remote Project carries the same sidebar git badge as a local one — its branch and the size of its working diff — read from git running on the Host over SSH; when the Host is Unreachable the last reading is kept and shown stale.
- **Remote Sessions** — Start, resume or fork a Session straight on a Remote Host: it runs Claude over SSH inside `tmux`, under the Host's active Account, and streams into a live terminal beside your local ones. Its State Dot tells the truth — `working` while Claude thinks, `needs input` on a prompt — read from the same titles and notifications a local Session emits. Close the tab and Claude keeps running on the Host; reopen it and you re-attach to the same conversation, no restart, even after quitting the app or closing the laptop. **Stop** ends it for real by killing the `tmux` session. The New Session dialog keeps permission mode, worktree, pre-launch command, additional directories and append-system-prompt; a failed launch surfaces the Host's prerequisite diagnostic, not a raw SSH error.
- **Pick remote Sessions back up** — Close the laptop, come back hours later, find every remote Session where it was. On launch and whenever a Remote Host comes back online, WootonPad lists the live `tmux` sessions on the Host and re-attaches each in the background, so a Session's State Dot is truthful before you ever click it — and a session someone started from another client on the same Host is picked up too. (On re-attach the `working` state is recovered immediately from the Session's `tmux` pane title; `needs input` is not re-derived from `tmux`, so a Session paused at a prompt keeps its last-known Dot until the CLI's next live repaint flips it.) A dropped connection is not an exit: when SSH dies because the network went away or the machine slept, the Host turns Unreachable and its Sessions stay put, shown at their last State, then re-attach themselves once the Host answers. Only Claude actually exiting inside `tmux` ends a Session.
- **Agent tooling** — Linear as the issue tracker, a mise task runner, ADRs and a project glossary.

---

<div align="center">

[![Download](https://img.shields.io/github/v/release/fortael/wootonpad?label=Download&style=for-the-badge&logo=github)](https://github.com/fortael/wootonpad/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-arm64-black?style=for-the-badge&logo=apple)](https://github.com/fortael/wootonpad/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange?style=for-the-badge)](LICENSE)

</div>

---

Wooton Pad is a desktop app that gives you a unified view of all your Claude Code sessions across every project. Launch, resume, fork, and monitor sessions from a single window — no more juggling terminal tabs or digging through `~/.claude/projects` to find that one conversation from last week.

![Wooton Pad](build/screenshot.png)

---

<div align="center">

**[Live Demo](https://fortael.github.io/wootonpad/)**

</div>

---

## Key Features

- **Session Browser** — All your Claude Code sessions, organized by project, searchable by content
- **Built-in Terminal** — Connect to running sessions or launch new ones without leaving the app
- **Status Notifications** — In-app alerts when a session is waiting for permission approval or user input
- **Fork & Resume** — Branch off from any point in a session's history
- **Full-Text Search** — Find any session by what was discussed, not just when it happened
- **IDE Emulation** — Acts as an IDE for Claude CLI, showing file diffs and opens in a side panel where you can accept, reject, or edit changes before they're applied. Supports both inline and side-by-side diff views. Disable this in Global Settings if you prefer Claude to use your own editor (VS Code, Cursor, etc.)
- **Plans & Memory** — Browse and edit your plan files and CLAUDE.md memory in one place
- **Activity Stats** — Heatmap of your coding activity across all projects
- **Session Names** — Picks up session names from Claude Code's `/rename` command automatically
- **Fork Features**
  - **Multi-Account** — Switch between personal and work Claude accounts in one click. Each account has its own session history, credentials, and usage tracking.
  - **Git Integration** — Per-project panel showing current branch, added/deleted line counts, unpushed commit count, and one-click branch switching.
  - **AI Commit Messages** — Generate commit messages with Claude from the project panel, with short/detailed/conventional style options.
  - **Docker Container Monitoring** — See running container status for each project directly in the project panel.
  - **GitLab Integration** — Connect a GitLab token in settings to pull avatars and enrich project metadata.
  - **File Tree Navigation** — Browse the full project directory tree in the side panel, open any file for viewing.
  - **Usage & Cost Tracking** — Token consumption and cost per account, refreshed on demand.
  - **Custom Fonts** — Configure the terminal and UI font in Global Settings.

---

## Installation

### Download

Grab the latest macOS build (Apple Silicon) from the releases page:

**[Download Wooton Pad](https://github.com/fortael/wootonpad/releases/latest)**

#### macOS security warning

Because Wooton Pad is not code-signed with an Apple Developer certificate, macOS will block it on first launch with a "damaged" message. Remove the quarantine attribute after installing:

```bash
xattr -cr "/Applications/WootonPad.app"
```

Then open the app normally.

### Build from source

```bash
git clone https://github.com/fortael/wootonpad.git
cd wootonpad
npm install
npm start        # run in dev mode
npm run build    # build a distributable for your platform
```

See **[docs/building.md](docs/building.md)** for full build instructions and prerequisites.

---

## External Launcher Integration

WootonPad registers the `wootonpad://` URL scheme so any external tool can open or resume sessions without spawning separate terminal windows.

```bash
# Open a new Claude session in a project
open wootonpad:///path/to/project

# Resume the most recent session in a project
open wootonpad://+/path/to/project
```

When WootonPad is already running, `open wootonpad://...` delivers the URL directly to the running instance via macOS Apple Events — no server, no polling. When it isn't running, macOS launches the app and passes the URL on startup.

---

## Session Grid Overview

Toggle the grid overview from the sidebar for a bird's-eye view of all your open sessions at once, grouped by project.

- **Live terminals** — Every open session renders its full terminal in a card, so you can monitor multiple Claude agents simultaneously.
- **Status at a glance** — Each card shows a running/stopped/busy indicator dot and last-activity timestamp.
- **Click to focus, double-click to expand** — Click a card header to focus it; double-click to switch back to single-terminal view for that session.
- **Persistent** — Grid preference is saved across restarts.

---

## File Preview Side Panel & Claude IDE MCP Emulator

Wooton Pad can act as an IDE for your Claude Code sessions. When enabled, Claude's file opens and proposed edits appear in a side panel next to the terminal instead of being sent to an external editor.

- **Diff review** — When Claude proposes a file change, it shows up as a diff in the side panel. You can review the changes and accept or reject them directly.
- **Inline & side-by-side** — Toggle between inline (unified) and side-by-side diff views. Your preference is remembered across sessions.
- **Partial acceptance** — In inline mode, you can accept or reject individual chunks within a diff, then submit the final result.
- **File viewer** — Clickable file links in terminal output (OSC 8 hyperlinks) open in the side panel with syntax highlighting.

To disable IDE emulation entirely (e.g. if you want Claude to use VS Code or Cursor instead), uncheck **IDE Emulation** in **Global Settings**. This stops Wooton Pad from registering as an IDE, so Claude CLI will discover and connect to your real editor. Changes take effect on new sessions — running sessions are not affected.

---

## Status Notifications

Wooton Pad monitors all your sessions in the background and shows status indicators in the sidebar so you can tell at a glance which sessions need attention — even when you're working in a different one.

- **Waiting for input** — A session that needs your response is highlighted so you don't miss it.
- **Permission approval** — When Claude is blocked waiting for a permission grant, the session badge lets you know immediately.
- **Activity indicators** — See which sessions are actively running, idle, or finished.

---

## Editor

| Shortcut | Action |
|----------|--------|
| `Cmd+F` / `Ctrl+F` | Find in file (also works in terminal) |
| `Cmd+G` / `Ctrl+G` | Go to line |

---

## Development Setup

**Prerequisites:** Node.js 20+, npm 10+, and platform build tools for native modules:
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential`, `python3` (`sudo apt install build-essential python3`)
- **Windows**: Visual Studio Build Tools or `npm install -g windows-build-tools`

```bash
npm install
npm start
```

`npm start` bundles CodeMirror and launches Electron. For faster iteration after the first run:

```bash
npm run electron
```

## Building

```bash
npm run build:mac     # DMG (arm64)
npm run build:win     # NSIS installer (x64 + arm64)
npm run build:linux   # AppImage + deb (x64 + arm64)
```

Output goes to `dist/`.

---

## Auto-Updates

The app checks for updates from GitHub Releases on launch and every 4 hours. A status indicator in the toolbar shows when a new version is available.
