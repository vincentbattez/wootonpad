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

**Slug**:
A named lineage of Sessions within one Project.
_Avoid_: Thread, topic

**Session**:
One Claude Code conversation.
_Avoid_: Conversation, chat
