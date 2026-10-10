# A Remote Session launch reads the Host and cwd back out of its Project key

ADR 0016 (`0016-remote-project-key-scheme.md`) fixed a Remote Host's Project key as
`ssh://<hostId>/<path>` and called the scheme **a one-way qualification, not a parser**: code reads
the key as an opaque identity and "never splits `ssh://<hostId>/<path>` back into a Host and a path."
That held while the key was only an identity for the cache and the search index (VIN-150) — nothing
in that seam ever needed the parts back.

VIN-155 adds the thing that does. To launch a Session on a Remote Host, the adapter must dial the
Host — which needs its `hostId` — and start tmux in the Host-side cwd — which needs the `<path>`.
**Both facts live only in the key.** The host-side cwd in particular is stored nowhere else: the
project group carries the qualified key, `remote` and `hostId` but not the raw path, the on-disk
folder is a lossy `encodeProjectPath` of it, and no Source or mirror descriptor records it. There is
no structured field to thread through the `open-terminal` IPC in its place — threading one would
mean parsing the key somewhere else first (and, if in the renderer, parsing forgeable input outside
the main process, against CODING_STANDARDS).

So the launch adapter performs exactly **one** controlled inverse of the Source's qualification:
`parseRemoteProjectPath` splits `ssh://<hostId>/<path>` into `{ hostId, remotePath }` (and returns
null for a bare local path, so local launches are untouched). This amends 0016's "nothing parses it
back" for the launch path only; the cache, the folder key and the search index keep reading the key
as opaque.

## Consequences

The exception is narrow and legible. It is a single named function (`parseRemoteProjectPath` in
`remote-launch.js`), the mirror image of the Source's own inverse `rawFolder` — both strip the
`ssh://<hostId>/` shape the Source added. It derives an **identity and a path**, never a connection
detail: `hostId` is resolved to a Host — and only then to its `sshTarget`, the dialable endpoint —
through the Host store in `remoteLaunchContext`, so the key still holds no endpoint and a Host that
moves networks still launches. A local key (no `ssh://` prefix) parses to null and takes the local
PTY path exactly as before.

The inverse is pure and tested away from the network (`test/remote-launch.test.js`), alongside the
rest of the launch-command core.
