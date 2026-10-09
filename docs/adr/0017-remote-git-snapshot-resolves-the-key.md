# The light Git Snapshot is the one seam allowed to resolve a Remote Project key to an endpoint

This amends [0016-remote-project-key-scheme](0016-remote-project-key-scheme.md). That decision
qualifies a Remote Project path into a key `ssh://<hostId>/<path>` and rules the key **an identity,
not a dialable endpoint**: "nothing parses it back into connection details", and (Consequences)
"Code reads a Project key as an opaque identity; it never splits `ssh://<hostId>/<path>` back into a
Host and a path." That remains the rule everywhere — the cache, the sidebar, `cache_meta`, the
search index — and is why a Host moving networks never rekeys a persisted Project.

VIN-159 adds the one exception that rule cannot absorb. A Remote Project shows the same sidebar git
badge as a local one — its branch and the size of its working diff — and git only produces that by
running `cd <path> && git …` **on the Host**. There is no identity-only way to read it: the badge is
a fact about a directory on a specific machine, so computing it *is* dialing `(hostId, path)`. The
light Git Snapshot therefore resolves the key back into exactly that pair, and nothing else may.

This is a single, named seam, not a loosening of 0016. `remote-git.js` (`parseRemoteKey` /
`resolveRemoteGitArgs`) is the only code that splits an `ssh://<hostId>/<path>` key, and it exists
solely to build the argv that runs the Snapshot's git on the Host. The split is one-way at the point
of use — the resolved `(hostId, path)` is handed straight to `ssh` and never written back to the
cache as a key — so the identity invariant 0016 protects (a key survives a Host moving networks, two
Hosts with the same path stay two rows) is untouched. The resolution is a pure function of plain
values, tested without a socket (`remote-git.js`, `test/remote-git.test.js`), so the seam is auditable
in one place rather than smeared across callers.

## Considered options

**Leave 0016 as an absolute and read the badge some other way.** There is no other way: the branch
and working-diff size of a directory on the Host are not derivable from the key or from anything the
Local Host holds. Keeping the rule absolute would mean a Remote Project has no git badge at all,
which is the feature VIN-159 ships.

**Carry `(hostId, path)` as data alongside the key so nothing ever "splits" it.** The Source already
threw that pair away when it qualified the path into a key (0016, on purpose — the key is the one
store the cache keeps). Re-plumbing the pair through every layer that holds a key, only so the
Snapshot can avoid a regex, teaches the whole cache about Hosts again — exactly what 0016 qualified
once at the boundary to avoid. One tested seam that re-derives the pair at the point of dialing is
smaller and does not leak Hosts back into the cache.

## Consequences

0016 stands unchanged for every reader of a key except this one. The carve-out is exactly: running
the light Git Snapshot's git command on the Host (`remote-git.js`), which `main.js` wires to `ssh`.
Any *new* need to turn a key back into an endpoint is still forbidden by 0016 and needs its own
decision — this ADR widens the door by one named seam, not into a general permission.

Because the split lives in one pure module, the BatchMode/host-key safety it inherits from
`remote-hosts.sshArgs` (ADR 0016-remote-hosts-over-ssh) is asserted on the argv it builds, the same
way every other generated SSH vector is.
