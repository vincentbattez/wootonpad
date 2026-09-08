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
    const filePath = path.join(projectsDir(), folder, sessionId + '.jsonl');
    const ctx = readTail(filePath);
    // No assistant usage yet (a just-started Session) pushes nothing — the row shows the
    // empty "measuring" track, never a fabricated zero.
    if (ctx) send(sessionId, ctx.contextUsage, ctx.contextModel);
  }

  return { onFileChanged };
}

module.exports = { createContextLivePush };
