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
  getCachedFolder, readMirrorLineage, cleanPtyEnv, mirrorRoot, log,
}) {
  // After a restart `activeSessions` is empty, so a stale pre-re-key tmux name can't be reconciled
  // from it; the mirror's fork graph is read instead (injected so the adapter stays testable). The
  // reader is required like every other boundary — a forgotten wiring must fail loudly here, not
  // silently disable cross-restart stale-name resolution (CODING_STANDARDS). A Host with no mirror yet
  // yields an empty lineage, so every live id still keys as itself.
  if (typeof readMirrorLineage !== 'function') {
    throw new Error('createRemoteReattach: readMirrorLineage is required (the mirror fork-graph reader).');
  }
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
        // A dropped, re-keyed Session lives under its realSessionId while its tmux still carries the old
        // name (the rename was pending or failed), so its live tmux id (the old one) is NOT its map key.
        // Map every live tmux id back to the map key of the Session that owns it, and revive under that
        // real key — keying a fresh row on the raw live id would strand the dropped row and duplicate it
        // under the wrong key, so 'wake → re-attached automatically' would never revive it (VIN-160).
        const attached = [];
        const keyByTmuxId = new Map();
        for (const [id, s] of activeSessions) {
          if (!s.remote || s.hostId !== host.id) continue;
          const tmuxId = s.remoteTmuxId || id;
          if (!keyByTmuxId.has(tmuxId)) keyByTmuxId.set(tmuxId, id);
          if (s.exited || s.dropped) continue;
          attached.push(id);
          if (s.remoteTmuxId) attached.push(s.remoteTmuxId);
          if (s.realSessionId) attached.push(s.realSessionId);
        }
        // Across a restart `keyByTmuxId` is empty, so a live id carrying a stale pre-re-key name is
        // resolved forward to its realSessionId via the mirror's fork graph (VIN-160). The Session is
        // keyed under that real id (the id its sidebar row uses, so the State Dot lands on the right
        // row) but still attached to the tmux that exists — wp-<liveId> — via the tmuxId override.
        const toReattach = remoteLaunch.sessionsToReattach(liveIds, attached);
        // Only read the mirror when there is a fresh (not-in-process) id to resolve.
        const lineage = toReattach.some(id => !keyByTmuxId.has(id)) ? readMirrorLineage(host) : [];
        for (const liveId of toReattach) {
          const inProcessKey = keyByTmuxId.get(liveId);
          if (inProcessKey) { reattachRemoteSession(host, inProcessKey); continue; }
          const resolved = remoteLaunch.resolveReattachKey(liveId, lineage);
          reattachRemoteSession(host, resolved, resolved !== liveId ? { tmuxId: liveId } : undefined);
        }
      })
      .catch(e => log.warn(`[remote-reattach] list for ${host.sshTarget} failed: ${e.message}`));
  }

  // Spawn a headless ssh PTY that re-attaches one Session's tmux on the Host. It parses OSC for the
  // State Dot and buffers output exactly like a foreground launch (wirePtyHandlers), so clicking the
  // row later replays the buffer and streams live — no restart of Claude. Reviving an existing (dropped)
  // Session reuses its object (and its last buffered State) rather than starting a second row.
  function reattachRemoteSession(host, sessionId, opts = {}) {
    const existing = activeSessions.get(sessionId);
    if (existing && !existing.exited && !existing.dropped) return; // already live
    // The far side's tmux is named by the Session's remoteTmuxId, which diverges from sessionId on the
    // revive-in-place path: there sessionId is the activeSessions key (the realSessionId after a fork/
    // plan-accept re-key) while the tmux session still carries its original name until the rename lands
    // — or forever, if the rename was pending or failed. Target it the way every other tmux path does,
    // remoteTmuxId || sessionId (main.js buildStopArgs, hasSessionCommand); addressing wp-<realSessionId>
    // here would miss a tmux that never got renamed, so revival would silently fail (VIN-160). A fresh
    // attach's sessionId is itself a live tmux id off the list, so it falls through to sessionId —
    // unless a cross-restart stale-name resolve passed the real tmux name as `opts.tmuxId`, which the
    // Session was just keyed under its realSessionId for (reattachRemoteSessions).
    const tmuxId = (existing && existing.remoteTmuxId) || opts.tmuxId || sessionId;
    let args;
    try {
      args = remoteLaunch.buildAttachArgs({ sshTarget: host.sshTarget, sessionId: tmuxId });
    } catch (e) {
      log.warn(`[remote-reattach] skipping ${sessionId}: ${e.message}`);
      return;
    }
    let ptyProcess;
    try {
      ptyProcess = pty.spawn('ssh', args, {
        name: 'xterm-256color', cols: 120, rows: 30, cwd: os.homedir(),
        env: remoteLaunch.remotePtyEnv(cleanPtyEnv),
      });
    } catch (e) {
      log.warn(`[remote-reattach] spawn for ${sessionId} failed: ${e.message}`);
      return;
    }

    if (existing) {
      // Revive in place: keep the buffered output and last State, swap in the fresh PTY. Past the early
      // return `existing` is dropped (the common case) or exited (defensive — a real exit drops the
      // tmux id from the live list, so it is never re-attached, but reusing the object still beats
      // discarding its buffer). It is now an attach, not a launch — mark it re-attached so a pre-connect
      // death reads as a drop, not an exit.
      existing.pty = ptyProcess;
      existing.dropped = false;
      existing.exited = false;
      existing.firstResize = true;
      existing._reattached = true;
      log.info(`[remote-reattach] revived session=${sessionId} on ${host.sshTarget}`);
      wirePtyHandlers(ptyProcess, existing, sessionId);
      seedRemoteDot(host, existing, sessionId, tmuxId);
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
      // The Account this Session is attributed to — the Host's active Account, the only one mirrored
      // and cached (remote-mirror.sourceDescriptorFor). Carried so removing that Account can forget
      // this Session before its cache rows are purged (forgetAccountSessions, VIN-161); a tmux name
      // carries no Account, so this is the only attribution a fresh re-attach can make.
      accountId: remoteMirror.activeAccount(host).id,
      remote: true, hostId: host.id, sshTarget: host.sshTarget,
      // remoteTmuxId names the far-side tmux: usually == sessionId, but a cross-restart stale-name
      // resolve keys the Session under its realSessionId while its tmux still answers to the old name
      // (opts.tmuxId), so the two diverge exactly as they do after an in-process re-key (VIN-160).
      sourceId: descriptor.id, remoteTmuxId: tmuxId,
      // This Session arrived by re-attach, never a foreground launch: a pre-connect PTY death is a
      // dropped link to classify, not a failed launch to finalize as exited (VIN-160).
      _reattached: true,
    };
    activeSessions.set(sessionId, session);
    log.info(`[remote-reattach] background attach session=${sessionId} on ${host.sshTarget}`);
    wirePtyHandlers(ptyProcess, session, sessionId);
    seedRemoteDot(host, session, sessionId, tmuxId);
  }

  // A live Remote Session's ssh PTY died: tell a real exit from a dropped link (VIN-160). An
  // Unreachable Host is a drop outright; otherwise probe has-session — a tmux session still there is a
  // dropped client, ssh that couldn't connect is the Host gone, and a connected probe finding no
  // session is Claude's real exit, which finalizes exactly as a local one. The Host is looked up in
  // the store for one consistent shape, as the open-terminal drop-revival path does.
  function handleRemotePtyExit(session, sessionId, exitCode, signal) {
    // The ssh PTY is dead; whether this was a drop or a real exit is decided below, possibly after an
    // async has-session probe (up to connectTimeout). Release the dead handle synchronously now — the
    // whole decision runs off the exit event, so this precedes the probe — so a terminal-input/
    // terminal-resize arriving in that window can't pty.write into the dead PTY (VIN-160). Nothing in
    // the decision path reads session.pty; markRemoteDropped nulls it again, harmlessly.
    session.pty = null;
    // The Host was removed while this PTY was live (forgetHostSessions, VIN-161): its tmux was left
    // running on the Host — removal never stops a Session (AC2) — and the Host is being forgotten, so
    // make no has-session probe (nothing may touch a removed Host) and keep no stale row to revive.
    // Just let the dead handle go.
    if (session._forgotten) return;
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
  // (VIN-160). `sessionId` is the renderer/store key the Dot is pushed under; `tmuxId` names the far
  // side (they diverge after a re-key — see reattachRemoteSession). Fire-and-forget: a failed probe
  // simply leaves the Dot where it was.
  //
  // KNOWN LIMITATION (VIN-160, ADR 0018): this recovers only `working`, never `needs input`. The OSC 0
  // title is busy-or-idle; a Session paused at a prompt shows the idle title, indistinguishable from a
  // finished turn, and Claude's `needs input` signal is OSC 9, emitted live and not re-derivable from
  // tmux state. So a re-attached Session sitting at a prompt keeps its mirrored `done`/`sleeping` Dot
  // until the CLI's next OSC 9 repaint flips it to `needs input`. The busy case — the one that matters
  // while Claude thinks — is seeded here; the prompt case waits for the live stream. ADR 0018 records
  // why re-deriving the prompt case from tmux is infeasible, and flags that accepting this gap against
  // AC #2 is a product sign-off, not something the honest README note itself settles.
  // tmuxId is required: both callers resolve it (remoteTmuxId || sessionId) before calling, and a
  // `= sessionId` default would silently probe the wrong tmux after a re-key (CODING_STANDARDS).
  function seedRemoteDot(host, session, sessionId, tmuxId) {
    Promise.resolve(sshRun(host, { command: remoteLaunch.paneTitleCommand(tmuxId) }, { connectTimeout: 10 }))
      .then(res => {
        if (!res || res.code !== 0) return;
        seedBusyFromTitle(session, sessionId, String(res.stdout || '').trim());
      })
      .catch(() => {});
  }

  // Detach and forget every live/dropped Session of a removed Remote Host (VIN-161). The exit each
  // detach triggers short-circuits in handleRemotePtyExit (on the `_forgotten` mark) rather than
  // probing the now-removed Host or keeping a stale row. Returns the ids forgotten.
  function forgetHostSessions(hostId) {
    return forgetSessions(s => s.remote && s.hostId === hostId, `host=${hostId}`);
  }

  // Detach and forget every live/dropped Session of a removed non-Default Account (VIN-161). Same
  // contract as forgetHostSessions, scoped to the one Account: removing an Account purges its cached
  // Sessions (remote-removal-ipc.purgeAccount), so a live Session of it must be detached and
  // `_forgotten`-marked first, or the exit the detach triggers would finalize and re-cache the row
  // that was just purged — resurrecting a Session the removal promised to forget (AC1). Sessions are
  // attributed to an Account by the id they launched / re-attached under (session.accountId).
  function forgetAccountSessions(hostId, accountId) {
    return forgetSessions(
      s => s.remote && s.hostId === hostId && s.accountId === accountId, `host=${hostId} account=${accountId}`);
  }

  // The detach shared by both: kill each matched Session's local ssh client (which only detaches
  // tmux — Claude keeps running on the Host, AC2), mark it `_forgotten` so the exit short-circuits,
  // and drop the row. Never kills a tmux session. Returns the ids forgotten.
  function forgetSessions(matches, scopeLabel) {
    const forgotten = [];
    for (const [id, s] of [...activeSessions]) {
      if (!matches(s)) continue;
      s._forgotten = true;
      if (s.pty) { try { s.pty.kill(); } catch (e) { log.warn(`[remote-forget] kill ${id}: ${e.message}`); } }
      s.pty = null;
      activeSessions.delete(id);
      forgotten.push(id);
    }
    if (forgotten.length) log.info(`[remote-forget] detached ${forgotten.length} Session(s) of ${scopeLabel}`);
    return forgotten;
  }

  return {
    reattachRemoteSessions, reattachRemoteSession, handleRemotePtyExit, markRemoteDropped,
    forgetHostSessions, forgetAccountSessions,
  };
}

module.exports = { createRemoteReattach };
