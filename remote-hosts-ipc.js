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

const HOSTS_CONTROL_DIR = path.join(os.homedir(), '.wootonpad', 'ssh');
const HOST_PROBE_MS = 30 * 1000; // reachability reflects reality within one interval (CONTEXT.md)

function newHostId() { return 'host-' + randomUUID().replace(/-/g, '').slice(0, 12); }
function newRemoteAccountId() { return 'racc-' + randomUUID().replace(/-/g, '').slice(0, 12); }

// A stable SSH multiplexing socket per Host, so the periodic reachability probe rides a master
// connection instead of paying a full handshake each time (ADR 0016).
function controlPathFor(host) { return path.join(HOSTS_CONTROL_DIR, 'cm-' + host.id); }

// Run one prerequisite step on a Host over SSH. BatchMode=yes and a connect timeout come from
// sshArgs; the child is never written to and SSH_ASKPASS is disabled, so no password or host-key
// prompt can block the app even if one slipped past BatchMode. The result mirrors the shape the
// pure diagnostics expect: { code, stdout, stderr }.
function sshRun(host, step, { connectTimeout = 10 } = {}) {
  return new Promise(resolve => {
    try { fs.mkdirSync(HOSTS_CONTROL_DIR, { recursive: true }); } catch {}
    const args = remoteHosts.sshArgs(host.sshTarget, step.command, {
      connectTimeout, controlPath: controlPathFor(host),
    });
    execFile('ssh', args, {
      encoding: 'utf8',
      timeout: (connectTimeout + 10) * 1000,
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

// Build the adapter over its injected boundaries. `getSetting`/`setSetting` are the db store, `send`
// pushes to the renderer, `run` executes one step over SSH (the real one shells out; a test one
// answers from a table), and the timer functions are overridable so the probe lifecycle is testable.
function createRemoteHostsIpc({
  getSetting, setSetting, send,
  run = sshRun,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
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
    await Promise.all(hosts.map(async host => {
      const res = await run(host, remoteHosts.reachStep(), { connectTimeout: 8 });
      const reachable = remoteHosts.classifyReachability(res);
      if (hostReachability[host.id] !== reachable) {
        hostReachability[host.id] = reachable;
        send('host-reachability', host.id, reachable);
      }
    }));
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
    return hosts;
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
  };
}

module.exports = {
  createRemoteHostsIpc, sshRun, controlPathFor,
  HOSTS_CONTROL_DIR, HOST_PROBE_MS,
};
