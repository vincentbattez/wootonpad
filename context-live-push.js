// VIN-149: the live context push driven by the write signal the recursive fs.watch already
// sees. On each .jsonl change the throttle (context-push-throttle.js) decides whether this
// Session is due; if so we read only the file's tail (read-session-file.js, ~256KB — never a
// whole-file re-parse) and send the `session-context` event. This is the relay the gauge was
// missing: the value was already on disk on every API round, but only reached the renderer
// once per turn on the busy→idle transition, one turn behind the running window.
//
// Kept free of Electron so a test can drive it with a temp .jsonl and a collector: `send`,
// `projectsDir` and `now` are injected, the tail read defaults to the real one.
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

  return { onFileChanged };
}

module.exports = { createContextLivePush };
