# TASK

You are assembling the integration branch for feature **{{ROOT_ID}} — {{ROOT_TITLE}}**.

You are already on branch `{{INTEGRATION_BRANCH}}`, freshly created from
`{{BASE_BRANCH}}`. Merge the following branches into it, in the order given:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them by reading both sides and choosing
   the correct resolution — never take one side blindly
3. After resolving conflicts, run each of these to verify the tree still works:

{{VERIFY_COMMANDS}}

4. If any of them fails, fix the problem before moving on to the next branch

When every branch is merged, run those same commands one last time. If one
fails, fix it.

Finally, make a single commit summarizing the integration, prefixed with
`{{COMMIT_PREFIX}}`. A fast-forward leaves no merge commit, so use
`--allow-empty` when there is nothing else to record.

# SCOPE

Do **not** push, do **not** open a pull request, and do **not** touch Linear.
The orchestrator does all three on the host once you are done.

Once the branch is assembled and green, output <promise>COMPLETE</promise>.
