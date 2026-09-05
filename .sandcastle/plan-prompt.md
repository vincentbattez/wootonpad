# ISSUES

Here are the open issues in the repo:

<issues-json>

!`issues=$(linear api 'query{issues(first:250,filter:{project:{name:{eq:"Wooton"}},labels:{name:{eq:"ready-for-agent"}},state:{type:{nin:["completed","canceled","duplicate"]}}}){nodes{identifier title description state{name} parent{identifier} children{nodes{identifier}} inverseRelations{nodes{type issue{identifier state{type}}}}}}}') && printf '%s' "$issues" | jq '[.data.issues.nodes[] | {id:.identifier,title,body:(.description//""),state:.state.name,parent:(.parent.identifier//null),children:[.children.nodes[].identifier],blockedBy:[.inverseRelations.nodes[]|select(.type=="blocks" and ((.issue.state.type|IN("completed","canceled","duplicate"))|not))|.issue.identifier]}]'`

</issues-json>

The list above has already been filtered to issues ready for work. `blockedBy` lists the still-open issues the tracker declares as blocking that one — always honour it. `parent`/`children` show the spec tree: work the leaves, not a parent that still has open children.

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
