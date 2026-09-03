# TASK

You are finishing the integration branch for feature **{{ROOT_ID}} — {{ROOT_TITLE}}**.

You are already on branch `{{INTEGRATION_BRANCH}}`, cut from `{{BASE_BRANCH}}`. The
orchestrator merged these branches into it cleanly, in this order, and they need
nothing from you:

{{MERGED_BRANCHES}}

It stopped at the first merge that conflicted. Merge the following branches, in the
order given — the first one is the merge that conflicted:

{{BRANCHES}}

When that list is empty, every branch is already merged and the feedback loops below
fail on the result. Your job is then only to make them pass.

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them by reading both sides and choosing
   the correct resolution
3. After resolving conflicts, run each of these to verify the tree still works:

{{VERIFY_COMMANDS}}

4. If any of them fails, fix the problem before moving on to the next branch

When every branch is merged, run those same commands one last time. If one
fails, fix it.

Finally, make a single commit summarizing the integration, prefixed with
`{{COMMIT_PREFIX}}`. A fast-forward leaves no merge commit, so use
`--allow-empty` when there is nothing else to record.

# LICENCE

You are here because a script could not do this without judgement. Your licence is
narrow, and the failure it guards against is silent: a green branch with a feature
quietly missing.

- Edit only the files the merge left conflicted, and what a fix to the feedback
  loops strictly requires.
- Never resolve a file wholesale with `--ours`, `--theirs`, `checkout --ours` or
  `checkout --theirs`. Every hunk is read and reconciled — both branches' work
  must survive.
- Never delete another branch's work to make a conflict go away. If the two sides
  made incompatible design decisions, that is a call for a human: output
  <promise>BLOCKED</promise> and say which files and which decisions.

# SCOPE

Do **not** push, do **not** open a pull request, and do **not** touch Linear.
The orchestrator does all three on the host once you are done.

Once the branch is assembled and green, output <promise>COMPLETE</promise>.
