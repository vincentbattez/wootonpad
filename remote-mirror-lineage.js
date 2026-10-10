// remote-mirror-lineage.js — read a Host's mirror fork graph off disk (VIN-160).
//
// After a quit+relaunch `activeSessions` is empty, so a stale pre-re-key tmux name can't be
// reconciled from the live store; the remote-reattach adapter resolves it forward through the
// mirror's fork graph instead. This module is the thin side that walks the mirror on disk and
// derives one parent edge per mirrored .jsonl; the resolution itself is remote-launch's pure core.
// It lives out of main.js so the disk walk plus the parent-edge derivation are testable directly
// (CODING_STANDARDS: keep new logic out of main.js).

const fs = require('fs');
const path = require('path');
const remoteMirror = require('./remote-mirror');
const { readNewSessionSignals } = require('./session-transitions');

// Pure: derive one mirrored Session's parent edge from the head-of-file signals that fork/
// plan-accept detection already reads (session-transitions). An explicit `forkedFrom` wins; failing
// that, a `parentSessionId` is the edge — but a non-forked file carries its own id there, so that
// self-referential case is guarded and yields null (an original), as does a file with neither.
function deriveParentEdge(id, sig) {
  if (sig.forkedFrom) return sig.forkedFrom;
  if (sig.parentSessionId && sig.parentSessionId !== id) return sig.parentSessionId;
  return null;
}

// Adapter: walk the Host's mirror, laid out as <mirrorDir>/<projectFolder>/<id>.jsonl, and return
// one `{ id, forkedFrom }` per mirrored Session. A missing or unreadable mirror (or folder) yields
// no lineage rather than throwing — a Host with nothing mirrored yet simply has every id key as
// itself downstream.
function readMirrorLineage(mirrorRoot, host) {
  const dir = remoteMirror.mirrorDirFor(mirrorRoot, host);
  const out = [];
  let folders;
  try { folders = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderPath = path.join(dir, folder.name);
    let files;
    try { files = fs.readdirSync(folderPath); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const id = file.slice(0, -'.jsonl'.length);
      const sig = readNewSessionSignals(path.join(folderPath, file));
      out.push({ id, forkedFrom: deriveParentEdge(id, sig) });
    }
  }
  return out;
}

module.exports = { readMirrorLineage, deriveParentEdge };
