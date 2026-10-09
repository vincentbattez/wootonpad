# A Remote Host's Project key is `ssh://<hostId>/<path>`

A Project is identified by its path (CONTEXT.md). That was unambiguous while every Session the
cache indexed came from the Local Host: one machine, one filesystem, one meaning for
`/home/me/work/proj`. Remote Hosts (VIN-150) break that assumption. The same absolute path can
exist on the Local Host and on each Remote Host's Account mirror, and those are *different
Projects* — a Session opened against `/home/me/work/proj` on `mac-mini` has nothing to do with
the identically named directory on the laptop. If both keyed on the bare path they would collapse
into one sidebar row, and a fork on one Host could rekey the other's Session.

So a Source qualifies a raw project path into a Project key before it ever reaches the database.
The Local Host's Source qualifies as **identity** — a local key stays its own path, so every
persisted local row is untouched and local behaviour is unchanged. A Remote Host's Source
qualifies as **`ssh://<hostId>/<path>`**: the Host's id, carried in the scheme, keeps the same
path on two Hosts as two keys. The on-disk folder name is namespaced the same way
(`qualifyFolder`), because `cache_meta` and the search index are keyed by folder alone and are
not Account-scoped, so two Sources with identically named folders would otherwise collide there.

`hostId` is the stable identifier of a Host, not its address. The scheme deliberately reads like
an SSH URL — that is the transport VIN-150 reaches a Remote Host over — but the key is an
identity, not a dialable endpoint: it must survive a Host moving networks, and nothing parses it
back into connection details.

## Considered options

**Key on the bare path and disambiguate elsewhere.** Carry the Host alongside the path and join
on it at read time. But the Project key is the morphdom row id, the `cache_meta` key and the
search-map key — three places that are not Account-scoped. Disambiguating "elsewhere" means
teaching every one of them about Hosts; qualifying the key once, at the Source boundary, keeps
the rest of the cache ignorant that Remote Hosts exist.

**A synthetic opaque id** (a hash, a counter) mapped to `(hostId, path)` in a side table. It
removes the readable path from the key and buys nothing: the side table is a second store that
can drift from the key, and a `ssh://`-prefixed path is already unique and already legible in a
log.

## Consequences

The scheme is a one-way qualification, not a parser. Code reads a Project key as an opaque
identity; it never splits `ssh://<hostId>/<path>` back into a Host and a path. A null or empty
raw path is passed through untouched on any Source, so an un-derivable folder stays un-derivable
rather than becoming `ssh://<hostId>/`.

Because the Local Host qualifies as identity, this decision is invisible until the first Remote
Host registers a Source. That is deliberate: it is the seam VIN-150 builds on, shipped and tested
(`session-source.js`, `test/session-source.test.js`) ahead of the integration that exercises it.
