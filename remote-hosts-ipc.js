// remote-hosts-ipc.js — the Electron adapter and reachability-probe lifecycle for Remote Hosts.
//
// remote-hosts.js is the pure core: SSH addressing, prerequisite diagnostics, and the Host store
// transforms, all testable away from Electron and the network. This is the thin side that touches
// the world — it shells out over SSH, persists Hosts through the injected db settings, and runs the
// reachability probe, pushing a Host's badge only when it flips. Every boundary (settings, the
// renderer send, the SSH runner, the timer) is injected, so main.js only wires each ipcMain.handle
// to a method here and the whole lifecycle is exercised by node:test with a fake runner and no
// Electron (CODING_STANDARDS: keep new logic out of main.js). See docs/adr/0016.

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const remoteHosts = require('./remote-hosts');
const { qualifyRemoteProjectPath } = require('./session-source');

const HOSTS_CONTROL_DIR = path.join(os.homedir(), '.wootonpad', 'ssh');
const HOST_PROBE_MS = 30 * 1000; // reachability reflects reality within one interval (CONTEXT.md)

function newHostId() { return 'host-' + randomUUID().replace(/-/g, '').slice(0, 12); }
function newRemoteAccountId() { return 'racc-' + randomUUID().replace(/-/g, '').slice(0, 12); }

// A stable SSH multiplexing socket per Host, so the periodic reachability probe rides a master
// connection instead of paying a full handshake each time (ADR 0016).
function controlPathFor(host) { return path.join(HOSTS_CONTROL_DIR, 'cm-' + host.id); }

// The one place WootonPad shells out over SSH (ADR 0016-remote-hosts-over-ssh: this adapter "is the
// only part that shells out"). Given a ready `ssh` argv, it makes sure the control-socket dir exists,
// runs the child with BatchMode's second wall in place — SSH_ASKPASS disabled and no DISPLAY, so no
// password or host-key prompt can block the app even if one slipped past BatchMode — and resolves the
// uniform { code, stdout, stderr } shape every caller expects (code 255 when ssh dies without one).
// Every SSH boundary — the prerequisite/reachability probe and the Remote Project git Snapshot
// (VIN-159) — runs through here, so the askpass/BatchMode safety story lives in exactly one place
// and tightening it tightens both.
function runSsh(args, { timeout, maxBuffer } = {}) {
  return new Promise(resolve => {
    try { fs.mkdirSync(HOSTS_CONTROL_DIR, { recursive: true }); } catch {}
    const execOpts = {
      encoding: 'utf8',
      env: { ...process.env, SSH_ASKPASS_REQUIRE: 'never', DISPLAY: '' },
    };
    if (timeout != null) execOpts.timeout = timeout;
    if (maxBuffer != null) execOpts.maxBuffer = maxBuffer;
    execFile('ssh', args, execOpts, (err, stdout, stderr) => {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 255) : 0,
        stdout: stdout || '',
        stderr: stderr || (err ? err.message : ''),
      });
    });
  });
}

// Run one prerequisite step on a Host over SSH. BatchMode=yes and a connect timeout come from
// sshArgs; the shell-out and its safety come from the shared runSsh. The result mirrors the shape
// the pure diagnostics expect: { code, stdout, stderr }.
function sshRun(host, step, { connectTimeout = 10 } = {}) {
  const args = remoteHosts.sshArgs(host.sshTarget, step.command, {
    connectTimeout, controlPath: controlPathFor(host),
  });
  return runSsh(args, { timeout: (connectTimeout + 10) * 1000 });
}

// Build the adapter over its injected boundaries. `getSetting`/`setSetting` are the db store, `send`
// pushes to the renderer, `run` executes one step over SSH (the real one shells out; a test one
// answers from a table), and the timer functions are overridable so the probe lifecycle is testable.
function createRemoteHostsIpc({
  getSetting, setSetting, send, onReachabilityChange, onHostReachable,
  run = sshRun,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
  if (typeof onReachabilityChange !== 'function') {
    throw new Error('createRemoteHostsIpc: onReachabilityChange callback is required');
  }
  // Fired with a Host the moment it turns Reachable (undefined/false → true), so the owner can list
  // and re-attach its live remote Sessions (VIN-160). Required, like onReachabilityChange: the one
  // caller always wires it, so a missing one is a wiring mistake, not a mode to tolerate.
  if (typeof onHostReachable !== 'function') {
    throw new Error('createRemoteHostsIpc: onHostReachable callback is required');
  }
  // Hosts persist under their own setting key, so the Local Accounts store ('accounts') is never
  // touched and there is no migration. Each Host is normalised on read so a Default Account is
  // always present, even for a record written by an older build.
  function getHosts() {
    const stored = getSetting('hosts');
    if (!Array.isArray(stored)) return [];
    return stored.map(remoteHosts.normalizeHost);
  }
  function setHosts(hosts) { setSetting('hosts', hosts); }

  const hostReachability = {};
  let hostProbeTimer = null;

  // Probe every Host once and push only the ones whose reachability flipped, so the badge reflects
  // reality within one interval of a Host going down or coming back (CONTEXT.md, Reachable).
  async function probeHostsOnce() {
    const hosts = getHosts();
    let flipped = false;
    await Promise.all(hosts.map(async host => {
      const res = await run(host, remoteHosts.reachStep(), { connectTimeout: 8 });
      const reachable = remoteHosts.classifyReachability(res);
      if (hostReachability[host.id] !== reachable) {
        hostReachability[host.id] = reachable;
        send('host-reachability', host.id, reachable);
        flipped = true;
        // Turning Reachable (from Unreachable, or from not-yet-probed at startup) is the cue to pick
        // its Sessions back up: list the live tmux sessions and re-attach each (VIN-160).
        if (reachable) onHostReachable(host);
      }
    }));
    // A flip changes which Projects are greyed — remote-mirror.annotateProjects reads this map at
    // get-projects time (CONTEXT.md: Unreachable Host → its Projects greyed). Nudge the sidebar to
    // re-fetch so the Unreachable→greyed and Reachable→un-greyed transitions land within one probe
    // interval rather than waiting on the next unrelated projects refresh.
    if (flipped) onReachabilityChange();
  }

  function startHostProbe() {
    if (hostProbeTimer) return;
    probeHostsOnce();
    hostProbeTimer = setIntervalFn(probeHostsOnce, HOST_PROBE_MS);
  }
  // Stop the probe and release its timer, so nothing keeps firing after the app is told to quit.
  function stopHostProbe() {
    if (hostProbeTimer) { clearIntervalFn(hostProbeTimer); hostProbeTimer = null; }
  }

  function addHost({ name, sshTarget }) {
    const hosts = remoteHosts.addHost(getHosts(), { name, sshTarget }, newHostId);
    setHosts(hosts);
    probeHostsOnce(); // surface the new Host's badge without waiting a whole interval
    return hosts;
  }
  function addRemoteAccount(hostId, account) {
    const hosts = remoteHosts.addRemoteAccount(getHosts(), hostId, account, newRemoteAccountId);
    setHosts(hosts);
    return hosts;
  }
  function removeHost(hostId) {
    const hosts = remoteHosts.removeHost(getHosts(), hostId);
    setHosts(hosts);
    delete hostReachability[hostId];
    // Drop the Host's hand-added Remote Projects (VIN-157), so a removed Host leaves no ghost row
    // that can never be reached, un-greyed or re-added.
    const global = getSetting('global') || {};
    if (Array.isArray(global.remoteProjects) && global.remoteProjects.some(rp => rp.hostId === hostId)) {
      global.remoteProjects = global.remoteProjects.filter(rp => rp.hostId !== hostId);
      setSetting('global', global);
    }
    return hosts;
  }

  // Add a Remote Project by hand (VIN-157). A Project where Claude never ran has no folder in the
  // Account's projects dir, so the rsync mirror can't discover it; the user picks the Host and types
  // a path (the native folder picker can't browse another machine). The path is validated on the
  // Host as an existing directory, then persisted keyed ssh://<hostId>/<path> so it shows in the
  // sidebar at once and survives both app restart (it is in settings) and the next mirror sync (the
  // mirror's --delete only touches the mirror dir, never this record). Hidden Remote Projects are
  // un-hidden by re-adding, exactly like local ones.
  async function addRemoteProject(hostId, rawPath) {
    const host = getHosts().find(h => h.id === hostId);
    if (!host) return { error: 'Host not found. It may have been removed.' };

    let diag;
    try {
      diag = await remoteHosts.checkRemoteDir({ host, path: rawPath }, step => run(host, step));
    } catch (err) {
      return { error: err.message };
    }
    if (!diag.ok) return { error: diag.message, step: diag.step };

    const projectPath = qualifyRemoteProjectPath(hostId, rawPath);
    const global = getSetting('global') || {};

    // Un-hide, like the local add-project flow: re-adding a removed Project brings it back.
    if (Array.isArray(global.hiddenProjects) && global.hiddenProjects.includes(projectPath)) {
      global.hiddenProjects = global.hiddenProjects.filter(p => p !== projectPath);
    }

    const records = Array.isArray(global.remoteProjects) ? global.remoteProjects : [];
    if (!records.some(rp => rp.projectPath === projectPath)) {
      global.remoteProjects = [...records, { hostId, projectPath }];
    } else {
      global.remoteProjects = records;
    }
    setSetting('global', global);

    return { ok: true, projectPath };
  }
  function removeRemoteAccount(hostId, accountId) {
    const hosts = remoteHosts.removeRemoteAccount(getHosts(), hostId, accountId);
    setHosts(hosts);
    return hosts;
  }
  function testConnection(hostId) {
    const host = getHosts().find(h => h.id === hostId);
    if (!host) return Promise.resolve({ ok: false, step: 'unknown', message: 'Host not found.', command: '' });
    return remoteHosts.testConnection({ host, accounts: host.accounts }, step => run(host, step));
  }
  function getReachability() { return { ...hostReachability }; }

  return {
    getHosts, setHosts,
    probeHostsOnce, startHostProbe, stopHostProbe, getReachability,
    addHost, addRemoteAccount, removeHost, removeRemoteAccount, testConnection,
    addRemoteProject,
  };
}

module.exports = {
  createRemoteHostsIpc, runSsh, sshRun, controlPathFor,
  HOSTS_CONTROL_DIR, HOST_PROBE_MS,
};
