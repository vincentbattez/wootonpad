// remote-mirror-ipc.js — the Electron/Node adapter around the pure remote-mirror core (VIN-154).
//
// remote-mirror.js decides where a Host's mirror lives, how rsync addresses it, and which Source it
// registers — all as functions of plain values. This is the thin side that touches the world: it
// runs rsync over SSH on a poll, registers each Host's mirror as a session-cache Source, and
// re-indexes it when the sync brought something new. Every boundary (the Host store, the live
// reachability map, the session cache, the rsync runner, the timer) is injected, so main.js only
// wires it up and the whole lifecycle is exercised by node:test with fakes and no socket
// (CODING_STANDARDS: keep new logic out of main.js). See docs/adr/0016.

const fs = require('fs');
const { execFile } = require('child_process');
const remoteMirror = require('./remote-mirror');
const { createSource } = require('./session-source');

// Polled like a WSL account's projects dir (main.js PROJECTS_POLL_MS): a new .jsonl on the Host
// shows up within one interval plus indexing (VIN-154 acceptance). rsync only transfers deltas and
// an in-flight scan is coalesced by the cache, so a slow network self-throttles rather than piles.
const MIRROR_POLL_MS = 5000;

// Run one rsync, mirroring a Host's remote projects dir into its local mirror dir. BatchMode=yes
// comes from rsyncArgs' ssh transport; SSH_ASKPASS is disabled and DISPLAY cleared so no prompt can
// block the app even if BatchMode were bypassed. Result mirrors the shape syncOnce expects.
function rsyncRun(descriptor, { connectTimeout = 15 } = {}) {
  return new Promise(resolve => {
    try { fs.mkdirSync(descriptor.projectsDir, { recursive: true }); } catch {}
    const args = remoteMirror.rsyncArgs({
      sshTarget: descriptor.sshTarget,
      remoteProjectsDir: descriptor.remoteProjectsDir,
      localDir: descriptor.projectsDir,
      connectTimeout,
    });
    execFile('rsync', args, {
      encoding: 'utf8',
      timeout: (connectTimeout + 50) * 1000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, SSH_ASKPASS_REQUIRE: 'never', DISPLAY: '' },
    }, (err, stdout, stderr) => {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 255) : 0,
        stdout: stdout || '',
        stderr: stderr || (err ? err.message : ''),
      });
    });
  });
}

// Build the adapter over its injected boundaries. `getHosts` is the persisted Host store,
// `getReachability` the live hostId→bool map the probe maintains, `sessionCache` the Source
// registry, `runRsync` shells out (a fake in tests), and the timer functions are overridable so the
// poll lifecycle is testable.
function createRemoteMirrorIpc({
  getHosts, getReachability, sessionCache, mirrorRoot,
  runRsync = rsyncRun, log = console, onIndexed = null,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
  // sourceId → the descriptor currently registered, so a changed active Account (new projectsDir /
  // accountId) is detected and re-registered rather than silently kept stale.
  const registered = new Map();
  let timer = null;
  let running = false;

  async function syncOnce() {
    // Guard against a slow sweep overlapping the next tick: rsync over a flaky link can outlast the
    // interval, and two concurrent sweeps would double-register and double-index.
    if (running) return;
    running = true;
    try {
      const hosts = getHosts() || [];
      const reachability = (getReachability && getReachability()) || {};
      const desired = remoteMirror.reconcile(hosts, { mirrorRoot });
      const desiredById = new Map(desired.map(d => [d.id, d]));

      // Drop Sources for Hosts no longer present — this evicts their cache (a Host the user
      // removed). A Host merely Unreachable is still desired, so its cache is kept (nothing evicted).
      for (const id of [...registered.keys()]) {
        if (!desiredById.has(id)) {
          sessionCache.unregisterSource(id);
          registered.delete(id);
        }
      }

      for (const d of desired) {
        const prev = registered.get(d.id);
        const repoint = prev && (prev.projectsDir !== d.projectsDir || prev.accountId !== d.accountId);
        if (!prev || repoint) {
          if (repoint) sessionCache.unregisterSource(d.id); // active Account changed: re-point
          sessionCache.registerSource(createSource({
            id: d.id, projectsDir: d.projectsDir, accountId: d.accountId, hostId: d.hostId,
          }));
          registered.set(d.id, d);
          // On a re-point (the active Account was switched, VIN-158) the new Account's local mirror
          // may already hold its tree — a delta-only rsync would transfer nothing, so index it now
          // rather than leave the sidebar on the old Account's Projects until the Host next changes.
          if (repoint) sessionCache.populateCacheViaWorker(d.id);
        }

        // Mirror + re-index only a Reachable Host. Unreachable → the mirror stops and the cache is
        // kept (CONTEXT.md, Remote Project): the Project and its Sessions stay, greyed by the UI.
        if (reachability[d.hostId] === false) continue;
        try {
          const res = await runRsync(d);
          if (res && res.code === 0) {
            if (remoteMirror.hasRsyncChanges(res.stdout)) {
              sessionCache.populateCacheViaWorker(d.id);
              // A changed mirror may carry the new .jsonl of a fork / plan-accept: let the owner
              // re-run transition detection over this Host's live Sessions (VIN-155).
              if (onIndexed) { try { onIndexed(d); } catch (e) { log.warn && log.warn(`[mirror] onIndexed for ${d.hostId} failed: ${e.message}`); } }
            }
          } else {
            log.warn && log.warn(`[mirror] rsync for ${d.hostId} exited ${res && res.code}: ${((res && res.stderr) || '').trim()}`);
          }
        } catch (e) {
          log.warn && log.warn(`[mirror] rsync for ${d.hostId} failed: ${e.message}`);
        }
      }
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    syncOnce();
    timer = setIntervalFn(syncOnce, MIRROR_POLL_MS);
  }
  function stop() {
    if (timer) { clearIntervalFn(timer); timer = null; }
  }
  function registeredSourceIds() { return [...registered.keys()]; }

  return { syncOnce, start, stop, registeredSourceIds };
}

module.exports = { createRemoteMirrorIpc, rsyncRun, MIRROR_POLL_MS };
