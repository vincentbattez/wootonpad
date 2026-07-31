# ISSUES

Here are the open issues in the repo:

<issues-json>

!`linear api 'query($project:String!,$label:String!){issues(first:100,filter:{project:{name:{eq:$project}},state:{type:{nin:["completed","canceled"]}},labels:{name:{eq:$label}}}){nodes{identifier title description url priority state{name} parent{identifier}}}}' --variable project=Wooton --variable label=ready-for-agent > /tmp/issues.json && jq '[.data.issues.nodes[] | {id: .identifier, title, body: (.description // ""), url, state: .state.name, parent: (.parent.identifier // null)}]' /tmp/issues.json`

</issues-json>

The list above has already been filtered to issues ready for work (Linear project `Wooton`,
label `ready-for-agent`, state not Done or Canceled).

Each entry carries its `parent` (the spec it belongs to, if any), and many bodies end with a
`## Blocked by` section listing the issues that must land first. Use both when building the
dependency graph.

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked issues. If every issue is blocked, include the single highest-priority candidate (the one with the fewest or weakest dependencies).

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.
