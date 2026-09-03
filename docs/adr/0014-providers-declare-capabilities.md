# Providers declare capabilities rather than levelling the interface down

The orchestrator must eventually work against any tracker — Linear, GitHub Issues, Jira, a
folder of markdown files — and any forge. That means a provider seam, and a seam over
heterogeneous backends has two shapes.

The usual one is the lowest common denominator: the interface exposes only what every backend
supports. It is tidy, and it is wrong here. Markdown files have no workflow states, no labels
and no `blocks` relations — three things the orchestrator leans on for eligibility, for status
reporting, and for deriving dependency waves. Levelling down would strip Linear of all three
to accommodate a backend we barely use. The poorest backend would set the price for every
other.

So providers **declare what they can do** — `canSetState`, `hasRelations`, `hasLabels` — and
the orchestrator degrades against the declaration. No relations means the AI planner fallback
instead of a topological sort. No states means the run reports nothing back and says so. Each
backend is used to its full capability, and none is held to another's floor.

One thing is not optional: **a provider always yields a tree.** Roots and leaves are how the
orchestrator thinks — a root is a unit of work and a pull request, leaves are the tasks, and
intermediate nodes are specs. Deriving that tree is the provider's problem: Linear has native
sub-issues, Jira has epics, GitHub Issues has task-list checkboxes to parse. The orchestrator
never sees anything but a tree.

The markdown provider simulates states and relations in front-matter (`status:`,
`blocked-by:`). It could have declared them unsupported, but a markdown backlog wants those
fields anyway to be legible to a human, so the simulation costs nothing and keeps markdown a
first-class tracker rather than a crippled one.

## Consequences

A second implementation ships with the interface, not after it. An abstraction with a single
implementer is the first backend's shape wearing generic names, and it breaks on contact with
the second. Markdown is the cheapest possible check that the capability contract holds.

The contract is defined by a **test suite replayed against every provider**, not by the
TypeScript interface. Types cannot state that `setState` is a no-op when `canSetState` is
false, or that the tree is acyclic — and those are the properties that actually matter.

Degradation must be announced. A run that silently stops reporting status because the provider
cannot, or that quietly falls back to an AI planner because no relations were found, looks
identical to one that is working. Both cases are logged, and the missing-relations case files
an incident.

Every capability is a branch in the orchestrator, and each one is a place where behaviour
diverges by backend. This stays affordable only while the set is small and motivated by a
backend that exists. A capability flag added speculatively is a branch nobody ever executes.
