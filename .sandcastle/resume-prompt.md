# TASK

You were implementing issue {{TASK_ID}} on branch `{{BRANCH}}` (cut from
`{{BASE_BRANCH}}`) when you were stopped — the quota window closed, or a timeout
fired. This is the same session: the reasoning above is yours, and the branch is
where you left it.

Pick up where you left off. Only work on this issue.

# WHAT THE BRANCH HOLDS NOW

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

<working-tree>

!`git status --short`

</working-tree>

Anything uncommitted above was checkpointed for you, or is what you were about to
commit. Read it before continuing — do not redo work that is already there.

# FEEDBACK LOOPS

Before committing, run each of these and make sure they pass:

{{VERIFY_COMMANDS}}

# COMMIT

Commit as you go — every commit is work that survives the next interruption. The
commit message must start with the `{{COMMIT_PREFIX}}` prefix.

# HOW TO FINISH

You must end with exactly one of two signals. Nothing else counts as finishing,
and picking the wrong one is worse than picking none.

- The task is done and committed, or you established there was genuinely nothing
  to do: output <promise>COMPLETE</promise>.
- You cannot do the task: output <promise>BLOCKED</promise>, after leaving a
  comment on the issue saying what is missing and what you did complete, using
  `linear issue comment add {{TASK_ID}} --body "<what is missing>"`.

Committing partial work and outputting COMPLETE is the one failure the
orchestrator cannot detect. Do not do it.
