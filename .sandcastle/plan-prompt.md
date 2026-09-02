# CONTEXT

You are planning the work for a single feature: **{{ROOT_ID}} — {{ROOT_TITLE}}**.

The set of issues to work has already been decided. Your job is **not** to choose
what gets worked on — it is to decide **in which order** the issues below can be
worked so that concurrent agents don't collide.

## Issues remaining for this feature

<issues-json>
{{REMAINING_ISSUES}}
</issues-json>

Each entry carries `id`, `title`, `body` and `branch`. Use the branch name exactly
as given — it is deterministic so that a re-run resumes the accumulated progress.

The bodies are not the whole story. When an issue's ordering is unclear, read its
place in the tree with:

```
linear issue view <id> --json --no-pager | jq '{parent, children}'
```

Read **only** those two fields — the full record is far too much to carry for
every issue, and nothing else in it changes the ordering.

## Already landed in an earlier iteration

{{LANDED_ISSUES}}

These are done. Do **not** include them in your output.

# TASK

Group the remaining issues into **waves**. All issues inside a wave run
concurrently, in separate sandboxes. Waves run one after another, and each wave
is branched from `{{BASE_BRANCH}}` **plus everything the earlier waves landed** —
so an issue placed in a later wave really can read and build on the code the
earlier ones wrote.

That chaining is also the cost: everything in the same wave sees only the waves
before it, never its own siblings.

Put issue B in a later wave than issue A when:

- B's body has a `## Blocked by` section naming A
- B requires code or infrastructure that A introduces
- B's requirements depend on an API shape or a decision A establishes
- A and B modify overlapping files, so working them concurrently would produce
  merge conflicts

Independent issues belong in the same wave — do not serialize work that has no
reason to be serialized.

If every remaining issue is independent, emit a single wave containing all of them.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags. `waves` is an array
of arrays; the outer array is ordered, the inner arrays are not.

<plan>
{"waves": [[{"id": "ABC-1", "title": "First issue", "branch": "sandcastle/issue-ABC-1"}], [{"id": "ABC-9", "title": "Second issue", "branch": "sandcastle/issue-ABC-9"}]]}
</plan>

Always emit the `<plan>` tags. If there is nothing left to do, output
`<plan>{"waves": []}</plan>` so the run can exit cleanly.

Every remaining issue must appear in exactly one wave. Never invent issues that
are not in the list above.
