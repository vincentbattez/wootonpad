# TASK

Review branch `{{BRANCH}}` for {{TASK_ID}} against `{{INTEGRATION_BRANCH}}` and return a verdict. Read-only: a fixer applies your notes.

The review has two axes, kept separate:

- **Standards** — does the code conform to this repo's documented standards?
- **Spec** — does the code faithfully implement the issue?

A change can pass one and fail the other. Reporting them separately stops one axis from masking the other.

# CONTEXT

## Spec (the issue)

!`linear issue view {{TASK_ID}} --json --no-pager | jq '{identifier,title,description}'`

## Diff

!`git diff {{INTEGRATION_BRANCH}}...{{BRANCH}}`

## Commits

!`git log {{INTEGRATION_BRANCH}}..{{BRANCH}} --oneline`

# PROCESS

Run `npm test` first. A failing suite is a `changes` finding on its own.

Then run the two axes as **parallel sub-agents**, one per axis, so they don't pollute each other's context. Each gets the diff command `git diff {{INTEGRATION_BRANCH}}...{{BRANCH}}`, the commit list, and its own brief below.

## Standards sub-agent

Sources: `@.sandcastle/CODING_STANDARDS.md`, plus `CONTEXT.md` for domain vocabulary and the ADRs in `docs/adr/` covering the area touched. Paste the smell baseline below into its prompt in full — it has no other access to it.

Brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; (c) correctness risks: edge cases, unsafe casts, injection, credential leaks, behaviour without a test. Distinguish hard violations from judgement calls — documented-standard breaches and correctness risks can be hard, baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

### Smell baseline

Fowler's smells (_Refactoring_, ch.3), applied even where the repo documents nothing. Two rules bind it: **the repo overrides** (a documented standard always wins; suppress the smell where the repo endorses it), and **it's always a judgement call** ("possible Feature Envy", never a hard violation).

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

## Spec sub-agent

Sources: the issue above (title + description + acceptance criteria).

Brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

## Aggregate

Keep the two reports separate — do not merge or rerank findings across axes.

`changes` is for what must land before merge: a failing suite, a hard standards violation, a correctness risk, or any Spec finding. A judgement call that hurts nothing goes in the notes of an `approve`.

# OUTPUT

<review>
{"verdict":"approve","notes":"…"}
</review>

`verdict` is `approve` or `changes`.

For `changes`, `notes` is a numbered list under two headings, `Standards` then `Spec` — each item: file, what is wrong, what to do. The fixer works from it alone, so it carries no cross-axis ranking and no reference to this prompt. End with one line: findings per axis and the worst issue within each.

For `approve`, one line — findings per axis, and any judgement calls left as nits.

Then output <promise>COMPLETE</promise>.
