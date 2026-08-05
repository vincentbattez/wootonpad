# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the
actual label strings used in this repo's issue tracker (Linear — see
`docs/agents/issue-tracker.md`).

| Label in mattpocock/skills | Label in our tracker | Linear label ID                        | Meaning                                  |
| -------------------------- | -------------------- | -------------------------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | `6273ec8f-3184-412a-9e9b-d7611398661e` | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | `4b4c5ac1-c822-4948-a02c-9b6c8cc7fede` | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | `db7c3848-e1a7-41cd-a42c-329bac512993` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | `0733aac3-8d95-479f-b66e-d8d599534abe` | Requires human implementation            |
| `wontfix`                  | `wontfix`            | `6df7e776-6962-4f8d-b4ef-8fd1fe71e98a` | Will not be actioned                     |

All five exist as workspace-level labels in Linear. When a skill mentions a role (e.g. "apply
the AFK-ready triage label"), use the corresponding label string from this table.

The workspace also carries pre-existing type labels, orthogonal to triage state and combinable
with the above:

| Label         | Linear label ID                        |
| ------------- | -------------------------------------- |
| `Bug`         | `746d2bb7-8630-43da-b0f8-1e0df13ea05f` |
| `Feature`     | `b76582fc-aa28-4493-8f0e-ff31fbb9265e` |
| `Improvement` | `a433a4c5-a794-4af3-9f2d-a13dec4afaee` |
| `Security`    | `ffa77480-308d-4b22-913f-e0ab2804128b` |

Edit the right-hand column to match whatever vocabulary you actually use.
