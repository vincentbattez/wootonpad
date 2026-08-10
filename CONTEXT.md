# WootonPad

Session manager and IDE emulator for the Claude Code CLI. This glossary defines the vocabulary of the sidebar hierarchy and the session model.

## Language

### Sidebar hierarchy

**Area**:
A user-created container that groups Projects and other Areas, to any depth. An Area is never itself a Project — Projects are always leaves. An Area may hold sub-Areas and Projects side by side, and belongs to at most one parent Area.
_Avoid_: Group, folder, workspace, category

**Root Area**:
An Area with no parent Area — a top-level entry in the sidebar.

**Project**:
A working directory that holds at least one Session, identified by its path. A Project belongs to at most one Area.
_Avoid_: Repo, directory

**Ungrouped Project**:
A Project that belongs to no Area — it sits at the top level of the sidebar, alongside the root Areas.
_Avoid_: Orphan, loose project

**Worktree**:
A Project that is a git worktree of another Project, shown nested inside it.
_Avoid_: Branch, sub-project

**Project Folder**:
The working directory of a Project on disk — what the sidebar's folder button hands to the system file manager. Distinct from the Sessions folder, where Claude Code stores that Project's `.jsonl` files.
_Avoid_: Folder (unqualified), Reveal in Finder

**Slug**:
A named lineage of Sessions within one Project.
_Avoid_: Thread, topic

**Session**:
One Claude Code conversation.
_Avoid_: Conversation, chat

**Archived Session**:
A Session the user has set aside. It stays attached to its Project, never appears in that Project's main list, and is reachable only inside the Project's own archive — collapsed by default, compact when open. Reversible, and hidden from nothing: search still reaches it.
_Avoid_: Deleted, hidden, closed

**Plain Terminal**:
An interactive shell opened by hand inside WootonPad, attached to a Project. It is ephemeral — never archived, renamed or searched, since there is no `.jsonl` behind it — and dies with the app.
_Avoid_: Shell, console, tab

**Run Terminal**:
The one internal terminal a Project runs its Run Command in, opened by the sidebar's Run button. It is a Plain Terminal in every other respect — a real interactive shell, ephemeral, never archived or searched — and a Project has at most one, alive or waiting to be relaunched. Clicking Run again reveals it; it is never restarted by a click.
_Avoid_: Dev server, run tab, console

**Run Command**:
The command a Run Terminal starts on. User-authored, global with a per-Project override, empty by default — WootonPad never guesses it from a manifest. Sent to the shell verbatim, exactly as the user would type it.
_Avoid_: Dev command, start script

### Editors

**External IDE**:
A code editor installed on the machine, outside WootonPad, that a Project can be handed off to. Always qualified as _external_ — unqualified "IDE" refers to WootonPad acting as an IDE for the Claude CLI.
_Avoid_: IDE (unqualified), editor
