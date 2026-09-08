# VIN-149 — Diagnostic: the context gauge does not move live

Instrumented diagnostic that opens the work (the spec's first, blocking step): before any
fix, name which of the two feed paths that could move a Session row's context gauge fails
during a running turn, and why. Recorded here because this fork has no Linear write access
from the agent environment; it is the verifiable record referenced by the change.

## The symptom

A Session's context gauge only moved once the turn ended (busy → idle). During a long running
turn the value on disk climbed on every API round, but the bar sat still and only jumped at the
end — one turn behind the running window. For an out-of-app session or a fork whose `.jsonl`
WootonPad was not driving, it never moved at all.

## The two feed paths

A row's `contextUsage` (what `SessionContextGauge.vue` reads) can be fed two ways:

- **Path A — the OSC-title busy→idle fast path (VIN-143).** `pushSessionContext` (`main.js`)
  reads the `.jsonl` tail and sends the `session-context` IPC event. It is called from the
  OSC 0 title handler, on the transition from a Braille spinner char to `✳` — i.e. the moment
  the CLI reports idle (`main.js`, `isIdle && session._cliBusy`).
- **Path B — the folder re-index / projects rebuild.** The recursive `fs.watch` sees the
  `.jsonl` write, `queueFolder` debounces, the projects tree is rebuilt from the session cache
  (`buildProjectsFromCache`) and sent to the renderer; a rebuilt row carries `contextUsage`
  only if the cache has already parsed that tail.

## Which does not fire, and why

**Path A is the one that does not fire during a turn.** It is edge-triggered on the busy→idle
title transition, so by construction it fires *once, at turn end* — never while the turn is
still running. Two consequences:

1. Mid-turn the title stays "busy" (a Braille spinner), so Path A never fires; the value has
   changed on disk but nothing relays it. The gauge is frozen until idle.
2. It is gated on an in-app terminal WootonPad is reading OSC titles for
   (`!session.isPlainTerminal && session.projectFolder`). A session running outside the app, or
   a fork whose terminal WootonPad is not attached to, produces no idle title event, so Path A
   never fires for it at all.

**Path B fires on the write but delivers no fresh value.** The rebuild races the cache: a row
rebuilt before the tail's last assistant turn is indexed carries no usage, so on a running
session the re-index tends to *blank* the gauge rather than advance it, settling only once the
session stops and the cache catches up. (This is the race `applyStoredContext` exists to paper
over on the renderer side — see `context-gauge.mjs`.)

## Conclusion → the fix

The missing relay is a **write-signal-driven** live push: on each `.jsonl` change, read only the
tail and push `session-context`, throttled, independent of the OSC title and of the cache
re-index. That is exactly what VIN-149 adds — `context-live-push.js` hung off the existing
`fs.watch` signal in `startProjectsWatcher` (`main.js`), throttled by `context-push-throttle.js`
— plus `applyStoredContext` so Path B can no longer blank a running row.
