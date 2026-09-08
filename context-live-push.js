// VIN-149: the live context push driven by the write signal the recursive fs.watch already
// sees. On each .jsonl change the throttle (context-push-throttle.js) decides whether this
// Session is due; if so we read only the file's tail (read-session-file.js, ~256KB — never a
// whole-file re-parse) and send the `session-context` event. This is the relay the gauge was
// missing: the value was already on disk on every API round, but only reached the renderer
// once per turn on the busy→idle transition, one turn behind the running window.
//
// Kept free of Electron so a test can drive it with a temp .jsonl and a collector: `send`,
// `projectsDir` and `now` are injected, the tail read defaults to the real one.
const fs = require('fs');
const path = require('path');
const { readSessionContextTail } = require('./read-session-file');
const { createContextPushThrottle } = require('./context-push-throttle');

function createContextLivePush({
  send,
  projectsDir,
  readTail = readSessionContextTail,
  now = Date.now,
  intervalMs,
} = {}) {
  // `send` and `projectsDir` have no safe default — an undefined `send` no-ops the whole relay
  // and an undefined `projectsDir` throws deep in path.join on the first write. Fail loud at
  // construction instead of building a silently-broken push (CODING_STANDARDS, optional params).
  if (typeof send !== 'function') throw new TypeError('createContextLivePush: send is required');
  if (typeof projectsDir !== 'function') throw new TypeError('createContextLivePush: projectsDir is required');
  const throttle = createContextPushThrottle(intervalMs);

  // `folder` is a projects-dir subfolder, `filename` the changed file's basename. The
  // Session key is the .jsonl basename — the same key buildProjectsFromCache rows carry and
  // the renderer's sessionContext map reads, so an out-of-app Session and a fork land on the
  // key the gauge is already reading.
  function onFileChanged(folder, filename) {
    if (!filename || !filename.endsWith('.jsonl')) return;
    const sessionId = filename.slice(0, -'.jsonl'.length);
    const due = throttle.select([sessionId], now());
    if (!due.length) return;
    // Claude Code's projects dir is flat — one folder of .jsonl files per project — so the path
    // rebuilds as folder/sessionId.jsonl. A deeper watch path (nested subfolders) would rebuild a
    // wrong path here and readTail would return null; the push then safely no-ops rather than
    // pushing a bad value. Not reachable with today's layout; kept a silent safe-fail on purpose.
    const filePath = path.join(projectsDir(), folder, sessionId + '.jsonl');
    const ctx = readTail(filePath);
    // No assistant usage yet (a just-started Session) pushes nothing — the row shows the
    // empty "measuring" track, never a fabricated zero.
    if (ctx) send(sessionId, ctx.contextUsage, ctx.contextModel);
  }

  // Prior-sweep mtimes per folder, so onFolderChanged can name every .jsonl touched since it
  // last looked — not just the single newest. Claude Code's projects dir is one folder per
  // project, so two Sessions running in parallel in the same project append to two files in the
  // same folder; a "newest only" push would move whichever file won the mtime race and leave the
  // other frozen until the next sweep it happened to win. Keyed by folder path.
  const priorMtimes = new Map();

  // The polling fallback (WSL-backed accounts, and any account whose fs.watch failed — see
  // startProjectsWatcher in main.js) is folder-mtime granular: it knows a folder changed but not
  // which file. Enumerate the folder's .jsonl files and push every one modified since the prior
  // sweep — so all Sessions running in parallel in the same project move live, not just the one
  // that is newest at sweep time. The per-Session throttle collapses the resulting bursts, so no
  // extra IPC pressure follows; without this the gauge never moves live on those platforms.
  function onFolderChanged(folder) {
    const folderPath = path.join(projectsDir(), folder);
    let entries;
    try {
      entries = fs.readdirSync(folderPath, { withFileTypes: true });
    } catch {
      return;
    }
    const prior = priorMtimes.get(folder);
    const current = new Map();
    const changed = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      let mtime;
      try {
        mtime = fs.statSync(path.join(folderPath, entry.name)).mtimeMs;
      } catch {
        continue;
      }
      current.set(entry.name, mtime);
      // No prior snapshot (first sight of this folder) treats every file as changed: a change
      // did fire to reach here, we just have no baseline to name it, and the throttle bounds
      // the one-time burst. After that only files whose mtime actually advanced are pushed.
      if (!prior || prior.get(entry.name) !== mtime) changed.push(entry.name);
    }
    priorMtimes.set(folder, current);
    for (const name of changed) onFileChanged(folder, name);
  }

  return { onFileChanged, onFolderChanged };
}

module.exports = { createContextLivePush };
