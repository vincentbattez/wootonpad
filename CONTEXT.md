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

### Session state

**Session State**:
What a Session is doing right now, as one of four mutually exclusive values — `sleeping`, `needsInput`, `working`, `done`. It answers a single question: does this line still want something from me? A Plain Terminal or a Run Terminal has no Session State.
_Avoid_: Status, activity, phase

**Sleeping**:
A Session State: nothing is in progress and nobody is waiting. The default, and where a Session spends most of its life.
_Avoid_: Idle, inactive, dormant

**Needs Input**:
A Session State: the human holds the ball — the CLI is blocked on an approval, or it has finished a turn and the subject is not closed. The work is unfinished either way.
_Avoid_: Blocked, waiting, attention

**Working**:
A Session State: the CLI or one of its subagents is producing something. Nothing is expected from the human.
_Avoid_: Busy, running, active

**Done**:
A Session State: the subject is closed — no further human input is needed and the work is finished. The only State a machine cannot observe, so it is declared, never inferred; and it is lifted the moment the Session works again.
_Avoid_: Finished, completed, closed, resolved

**State Dot**:
The ring at the left of a Session row that renders its Session State, and only that. It never reports whether a shell is alive.
_Avoid_: Status dot, indicator, badge

**Unread**:
A Session whose latest output the human has not yet looked at. Orthogonal to Session State — reading is not working — and carried by the row's title, never by the State Dot.
_Avoid_: Response-ready, new, notification

### Git

**Git Snapshot**:
The reading of a Project's git state at one moment — branch, upstream, unpushed commits, changed files, tags, and the paths of its Worktrees. Always a reading, never an authority: it is re-read after every mutation. It comes in two depths — _light_ for the sidebar badge, _full_ for the Project Viewer — and the copy persisted to the cache deliberately omits the Worktree paths, so a stale Snapshot can never be mistaken for proof that a Worktree is gone.
_Avoid_: detail, info, status

### Editors

**External IDE**:
A code editor installed on the machine, outside WootonPad, that a Project can be handed off to. Always qualified as _external_ — unqualified "IDE" refers to WootonPad acting as an IDE for the Claude CLI.
_Avoid_: IDE (unqualified), editor

## Architecture front

Terms describing how the renderer's Vue layer is organised. Each is defined by the constraint it carries in this repo, not by its generic meaning elsewhere.

**Feature**:
A folder under `src/vue/features/` owning one piece of the domain — its Dumb Components, its Containers, its composables, its store, its Bridge and its pure modules. Movable: everything crossing its boundary is a prop, an emit, or its Bridge.
_Avoid_: Module, package, domain

**Dumb Component**:
A component that may import from `vue` and `shared/ui` and nothing else — no store, no service, no `window.*`. Its inputs are props, its outputs are emits, and it never invents a CSS class.
_Avoid_: Presentational, pure component, view component

**Container**:
A component holding behaviour: it reads its Feature's store, calls services, and composes Dumb Components. Exactly one per Feature — the one the outside mounts — imports the service layer; the others receive what they need as props.
_Avoid_: Smart component, controller, provider

**Page**:
A screen occupying the sidebar column, one per sidebar tab. It assembles Containers and holds no logic of its own.
_Avoid_: Panel, tab, screen

**View**:
A screen occupying the main surface — the JSONL viewer, the Project Viewer, Stats, Grid. Same rule as a Page, different surface.
_Avoid_: Overlay, viewer (unqualified), route

**Primitive**:
A cross-Feature Dumb Component under `shared/ui`, prefixed `Sb`. It carries no word from this glossary — a file naming a Session, an Area, a Project or a Slug belongs to its Feature.
_Avoid_: Atom, base component, widget

**Compound Component**:
A Primitive whose parts share a context provided by the parent. A part is never rendered outside its parent, and exists only when it consumes that context — otherwise the parent exposes a named slot instead.
_Avoid_: Slot component, subcomponent (unqualified)

**Bridge**:
The set of `window.vue*` objects a Feature exposes to the frozen legacy renderer. Owned by the Feature it serves, and written into that Feature's store — never into a component's private state.
_Avoid_: Adapter, API, glue
