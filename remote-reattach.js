// remote-reattach.js — the Electron adapter that picks remote Sessions back up (VIN-160).
//
// The point of a Remote Host: close the laptop, come back later, find every Session where it was.
// At startup and whenever a Host turns Reachable, WootonPad lists the live tmux sessions on the
// Host's dedicated socket and re-attaches each in the background — a headless ssh PTY whose renderer
// is detached — so its State Dot is truthful even if nobody opens it, and clicking the row reveals
// the already-attached terminal. When such a PTY dies it decides whether Claude really exited or the
// link just dropped (laptop slept, Wi-Fi cut), keeping a dropped Session stale for the next revival.
//
// The decisions (what to list, what to attach, what a dropped PTY means) are remote-launch's pure
// core, exercised by node:test away from the network. This is the thin side that shells out and
// spawns PTYs; every boundary — the SSH runner, the PTY spawn, the Session store, the reachability
// and Host lookups, the PTY wiring and exit finalize — is injected, so main.js only wires it
// (CODING_STANDARDS: keep new logic out of main.js). See docs/adr/0016.

const os = require('os');
const remoteLaunch = require('./remote-launch');
const remoteMirror = require('./remote-mirror');

// Build the adapter over its injected boundaries. `activeSessions` is the live Session store, `pty`
// spawns the headless ssh client, `sshRun` shells out for list/has-session/pane-title probes,
// `getReachability`/`getHosts` read the Host store, `wirePtyHandlers`/`finalizePtyExit` are the PTY
// lifecycle shared with a foreground launch, `seedBusyFromTitle` seeds the State Dot from a pane
// title, and `cleanPtyEnv`/`mirrorRoot`/`getCachedFolder`/`log` are the launch environment, mirror
// root, folder cache and logger.
function createRemoteReattach({
  activeSessions, pty, sshRun,
  getReachability, getHosts,
  wirePtyHandlers, finalizePtyExit, seedBusyFromTitle,
  getCachedFolder, cleanPtyEnv, mirrorRoot, log,
}) {
  // List the live tmux sessions on the Host's socket and re-attach each one not already attached.
  function reattachRemoteSessions(host) {
    if (!host || !host.sshTarget) return;
    Promise.resolve(sshRun(host, { command: remoteLaunch.listSessionsCommand() }, { connectTimeout: 10 }))
      .then(res => {
        // No tmux server (nothing was ever launched here) or an unreachable Host: nothing to pick up.
        if (!res || (res.code !== 0 && !String(res.stdout || '').trim())) return;
        const liveIds = remoteLaunch.parseTmuxSessionList(res.stdout);
        if (!liveIds.length) return;
        // Already-live Sessions of this Host are skipped; a dropped placeholder is eligible for revival.
        const attached = [];
        for (const [id, s] of activeSessions) {
          if (!s.remote || s.hostId !== host.id || s.exited || s.dropped) continue;
          attached.push(id);
          if (s.remoteTmuxId) attached.push(s.remoteTmuxId);
          if (s.realSessionId) attached.push(s.realSessionId);
        }
        for (const id of remoteLaunch.sessionsToReattach(liveIds, attached)) {
          reattachRemoteSession(host, id);
        }
      })
      .catch(e => log.warn(`[remote-reattach] list for ${host.sshTarget} failed: ${e.message}`));
  }

  // Spawn a headless ssh PTY that re-attaches one Session's tmux on the Host. It parses OSC for the
  // State Dot and buffers output exactly like a foreground launch (wirePtyHandlers), so clicking the
  // row later replays the buffer and streams live — no restart of Claude. Reviving a Session that had
  // dropped reuses its object (and its last buffered State) rather than starting a second row.
  function reattachRemoteSession(host, sessionId) {
    const existing = activeSessions.get(sessionId);
    if (existing && !existing.exited && !existing.dropped) return; // already live
    let args;
    try {
      args = remoteLaunch.buildAttachArgs({ sshTarget: host.sshTarget, sessionId });
    } catch (e) {
      log.warn(`[remote-reattach] skipping ${sessionId}: ${e.message}`);
      return;
    }
    let ptyProcess;
    try {
      ptyProcess = pty.spawn('ssh', args, {
        name: 'xterm-256color', cols: 120, rows: 30, cwd: os.homedir(),
        env: {
          ...cleanPtyEnv,
          TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '3',
          SSH_ASKPASS_REQUIRE: 'never', DISPLAY: '',
        },
      });
    } catch (e) {
      log.warn(`[remote-reattach] spawn for ${sessionId} failed: ${e.message}`);
      return;
    }

    if (existing && existing.dropped) {
      // Revive in place: keep the buffered output and last State, swap in the fresh PTY. It is now an
      // attach, not a launch — mark it re-attached so a pre-connect death reads as a drop, not an exit.
      existing.pty = ptyProcess;
      existing.dropped = false;
      existing.exited = false;
      existing.firstResize = true;
      existing._reattached = true;
      log.info(`[remote-reattach] revived dropped session=${sessionId} on ${host.sshTarget}`);
      wirePtyHandlers(ptyProcess, existing, sessionId);
      seedRemoteDot(host, existing, sessionId);
      return;
    }

    const descriptor = remoteMirror.sourceDescriptorFor(host, mirrorRoot);
    const folder = getCachedFolder(sessionId) || null;
    const session = {
      pty: ptyProcess, rendererAttached: false, exited: false,
      outputBuffer: [], outputBufferSize: 0, altScreen: false,
      projectPath: null, firstResize: true,
      projectFolder: folder, knownJsonlFiles: new Set(), sessionSlug: null,
      isPlainTerminal: false, sessionType: 'session', forkFrom: null,
      mcpServer: null, focusToken: null, _openedAt: Date.now(),
      remote: true, hostId: host.id, sshTarget: host.sshTarget,
      sourceId: descriptor.id, remoteTmuxId: sessionId,
      // This Session arrived by re-attach, never a foreground launch: a pre-connect PTY death is a
      // dropped link to classify, not a failed launch to finalize as exited (VIN-160).
      _reattached: true,
    };
    activeSessions.set(sessionId, session);
    log.info(`[remote-reattach] background attach session=${sessionId} on ${host.sshTarget}`);
    wirePtyHandlers(ptyProcess, session, sessionId);
    seedRemoteDot(host, session, sessionId);
  }

  // A live Remote Session's ssh PTY died: tell a real exit from a dropped link (VIN-160). An
  // Unreachable Host is a drop outright; otherwise probe has-session — a tmux session still there is a
  // dropped client, ssh that couldn't connect is the Host gone, and a connected probe finding no
  // session is Claude's real exit, which finalizes exactly as a local one. The Host is looked up in
  // the store for one consistent shape, as the open-terminal drop-revival path does.
  function handleRemotePtyExit(session, sessionId, exitCode, signal) {
    const reachable = getReachability()[session.hostId];
    const decide = (hasSessionCode) => {
      const verdict = remoteLaunch.classifyRemotePtyExit({ stoppedByUser: false, reachable, hasSessionCode });
      if (verdict === 'dropped') markRemoteDropped(session, sessionId);
      else finalizePtyExit(session, sessionId, exitCode, signal);
    };
    if (reachable === false) { decide(null); return; }
    const host = getHosts().find(h => h.id === session.hostId);
    if (!host) { markRemoteDropped(session, sessionId); return; } // Host gone from the store: keep stale
    Promise.resolve(sshRun(host, { command: remoteLaunch.hasSessionCommand(session.remoteTmuxId || sessionId) }, { connectTimeout: 10 }))
      .then(res => decide(res ? res.code : 255))
      .catch(() => markRemoteDropped(session, sessionId));
  }

  // Keep a Session whose link dropped: not exited, not deleted, shown at its last observed State until
  // the Host answers and auto-reattach revives it. No process-exited is sent — that would flip the row
  // to ended (CONTEXT.md, Reachable; VIN-160). The dead PTY is released so input can't hit it.
  function markRemoteDropped(session, sessionId) {
    session.dropped = true;
    session.pty = null;
    log.info(`[remote-drop] session=${sessionId} host=${session.hostId} — link dropped, kept stale for re-attach`);
  }

  // Seed a re-attached Session's live State Dot from the pane title tmux still holds — the CLI's last
  // OSC 0, which is the authoritative busy signal — so a busy Session reads as working at once rather
  // than waiting for the CLI's next spinner repaint, and an idle one keeps its mirrored State
  // (VIN-160). Fire-and-forget: a failed probe simply leaves the Dot where it was.
  function seedRemoteDot(host, session, sessionId) {
    Promise.resolve(sshRun(host, { command: remoteLaunch.paneTitleCommand(sessionId) }, { connectTimeout: 10 }))
      .then(res => {
        if (!res || res.code !== 0) return;
        seedBusyFromTitle(session, sessionId, String(res.stdout || '').trim());
      })
      .catch(() => {});
  }

  return { reattachRemoteSessions, reattachRemoteSession, handleRemotePtyExit, markRemoteDropped };
}

module.exports = { createRemoteReattach };
