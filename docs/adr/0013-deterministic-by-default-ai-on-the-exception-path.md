# Deterministic by default, AI on the exception path

An orchestrator built around agents can delegate anything, and the temptation is to delegate
everything — it is less code, and it handles cases nobody enumerated. We take the opposite
default: **the happy path is scripted, and an agent is invoked only where the script fails,
scoped to the failure.**

Two of the four agent calls were doing deterministic work. The planner ordered leaves into
dependency waves — an Opus call per retry round, per root — when the tracker already carries
`blocks` relations and a topological sort answers exactly. The integrator merged N branches,
which is `git merge` in a loop until a conflict says otherwise.

Both become scripts with an agent behind them. No relations declared? The AI planner runs.
Merge conflict or red suite? An agent gets that merge, and nothing else. The implementer and
the reviewer stay agents throughout — writing and judging code is the part that genuinely needs
reasoning.

The objection to determinism is real and was weighed: every case has to be coded, and the cases
are endless. The answer is not to enumerate them upfront but to let the exception path do it.
When the deterministic route throws, the agent unblocks the run **and** an incident is filed,
so that class of failure can be made deterministic afterwards. The system converges: each
exception met once becomes script the next time round. That loop closes through a human
reviewing incidents, not through the orchestrator editing itself — a tool that rewrites itself
while running is neither reproducible nor debuggable.

Three things follow from this, and they are the point of the decision.

**Tokens.** Determinism is free; every agent call is not, and the budget is a hard 5-hour
window shared by the whole run.

**Correctness.** A topological sort of declared relations is exact. An agent's reading of the
same tickets is a good guess. Where an exact answer exists, guessing is a downgrade.

**Legibility.** Deriving waves from declared relations forces dependencies to be *declared*,
in the tracker, before the run — visible to a human — instead of inferred by an agent during
it, visible to nobody.

## Consequences

The scripted paths are the ones that must be tested hardest. Their failures are silent by
construction: an agent that misunderstands announces itself in its output, a topological sort
with a wrong edge just runs the waves in the wrong order and the leaves fail later, for
reasons that look like anything but ordering.

Agents invoked on the exception path get narrow licences, not open ones. The merge-conflict
agent may touch conflicted files only, may not resolve by blanket `--ours`/`--theirs`, must
pass `verifyCommands`, and gets ten iterations before the root fails. The failure being
defended against is an agent "resolving" a conflict by deleting another leaf's work — a green
PR with a feature quietly missing.

The exception path is for *reasoning* failures. A closed quota window is not one: an
`interrupted` outcome must never trigger a fallback agent, because spending tokens on the
absence of tokens is the one move guaranteed not to work.

There is a floor to this. Some tasks are irreducibly judgement — a semantic conflict where two
leaves made incompatible design decisions is a human call, and the right behaviour is to stop
and say so, not to script harder or to let an agent pick.
