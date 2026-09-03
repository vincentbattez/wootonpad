# TASK

Review the code changes on branch `{{BRANCH}}` and improve code clarity, consistency, and maintainability while preserving exact functionality.

# CONTEXT

## Branch diff

!`git diff {{BASE_REV}}...HEAD`

## Commits on this branch

!`git log {{BASE_REV}}..HEAD --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Apply project standards**: Follow the coding standards defined in @{{CODING_STANDARDS}}

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run each of these to make sure nothing is broken:

{{VERIFY_COMMANDS}}

3. Commit describing the refinements, prefixed with `{{COMMIT_PREFIX}}`

If the code is already clean and well-structured, do nothing.

# HOW TO FINISH

You are the only review pass. Nothing runs after you and nothing re-reviews your
work, so finish what you start: every problem you report, you fix here.

- You reviewed the branch, fixed what you found, and the feedback loops pass:
  output <promise>COMPLETE</promise>.
- You found a problem you cannot fix — the implementation is wrong in a way that
  needs the issue re-worked, or the feedback loops fail and you cannot make them
  pass: output <promise>BLOCKED</promise>.

Listing findings and signing off without applying them is the one outcome that
must not happen. Either the fix is committed, or the branch is BLOCKED.
