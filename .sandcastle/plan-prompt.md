# CONTEXT

You are planning the work for a single feature: **{{ROOT_ID}} — {{ROOT_TITLE}}**.

The set of issues to work has already been decided, and none of them declares a
dependency on another in the tracker. Your job is **not** to choose what gets
worked on — it is to say **which issues depend on which**, so that the
orchestrator can order them and concurrent agents don't collide.

What you output is written back into the tracker as `blocks` relations. It is
read by a human afterwards and used by every future run, so declare only
dependencies you can justify.

## Issues remaining for this feature

<issues-json>
{{REMAINING_ISSUES}}
</issues-json>

Each entry carries `id`, `title` and `body`.

The bodies are not the whole story. When an issue's ordering is unclear, read its
place in the tree with:

```
linear issue view <id> --json --no-pager | jq '{parent, children}'
```

Read **only** those two fields — the full record is far too much to carry for
every issue, and nothing else in it changes the ordering.

## Already landed in an earlier iteration

{{LANDED_ISSUES}}

These are done and in `{{BASE_BRANCH}}`. Nothing needs to be declared against them.

# TASK

For each remaining issue, list the remaining issues that must land **before** it.
Issue B is blocked by issue A when:

- B's body has a `## Blocked by` section naming A
- B requires code or infrastructure that A introduces
- B's requirements depend on an API shape or a decision A establishes
- A and B modify overlapping files, so working them concurrently would produce
  merge conflicts — pick the more foundational one as the blocker

Independent issues get an empty list — do not serialize work that has no reason
to be serialized, and never declare a cycle.

# OUTPUT

Output your answer as a JSON object wrapped in `<plan>` tags:

<plan>
{"dependencies": [{"id": "ABC-1", "blockedBy": []}, {"id": "ABC-9", "blockedBy": ["ABC-1"]}]}
</plan>

Always emit the `<plan>` tags. Every remaining issue appears exactly once. Never
invent issues that are not in the list above.
