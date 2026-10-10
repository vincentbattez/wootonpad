// remote-mirror.js is the pure core of Remote Project mirroring (VIN-154): how the active
// Account's projects dir is addressed for rsync over SSH (with the same BatchMode safety as every
// other command, ADR 0016), where the local mirror lives, which session-cache Source each Host
// registers, and how the sidebar payload is annotated with Host name + reachability. No socket,
// no filesystem — every function is a function of plain values, tested here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  activeAccount, remoteProjectsDir, mirrorDirFor,
  rsyncArgs, hasRsyncChanges, sourceDescriptorFor, reconcile, annotateProjects,
} = require('../remote-mirror');

const MIRROR_ROOT = '/data/remote-mirrors';

function host(extra = {}) {
  return {
    id: 'host-abc', name: 'Mac Mini', sshTarget: 'mac-mini',
    accounts: [{ id: 'default', name: 'Default', configDir: '~/.claude' }],
    ...extra,
  };
}

// --- active Account ---------------------------------------------------------------------------

test('activeAccount falls back to the Default Account when none is marked active', () => {
  assert.equal(activeAccount(host()).id, 'default');
});

test('activeAccount honours activeAccountId when it names a real Account', () => {
  const h = host({
    activeAccountId: 'racc-2',
    accounts: [
      { id: 'default', name: 'Default', configDir: '~/.claude' },
      { id: 'racc-2', name: 'Work', configDir: '~/work/.claude' },
    ],
  });
  assert.equal(activeAccount(h).id, 'racc-2');
});

// --- remote projects dir ----------------------------------------------------------------------

test('remoteProjectsDir appends /projects and keeps a leading ~ for the remote shell to expand', () => {
  assert.equal(remoteProjectsDir({ configDir: '~/.claude' }), '~/.claude/projects');
  assert.equal(remoteProjectsDir({ configDir: '/opt/claude/' }), '/opt/claude/projects');
});

test('remoteProjectsDir rejects a config dir carrying shell metacharacters', () => {
  assert.throws(() => remoteProjectsDir({ configDir: '~/.claude"; rm -rf ~' }));
});

// --- mirror dir -------------------------------------------------------------------------------

test('mirrorDirFor namespaces the local mirror by Host id and active Account id', () => {
  assert.equal(mirrorDirFor(MIRROR_ROOT, host()), path.join(MIRROR_ROOT, 'host-abc', 'default'));
});

// --- rsync argv -------------------------------------------------------------------------------

test('rsyncArgs carries BatchMode=yes in its ssh transport', () => {
  const args = rsyncArgs({ sshTarget: 'mac-mini', remoteProjectsDir: '~/.claude/projects', localDir: '/m' });
  const e = args[args.indexOf('-e') + 1];
  assert.match(e, /BatchMode=yes/);
});

test('rsyncArgs never relaxes host-key checking', () => {
  const joined = rsyncArgs({ sshTarget: 'mac-mini', remoteProjectsDir: '~/.claude/projects', localDir: '/m' }).join(' ');
  assert.doesNotMatch(joined, /accept-new/i);
  assert.doesNotMatch(joined, /StrictHostKeyChecking=no/i);
});

test('rsyncArgs mirrors remote projects dir into the local dir with --delete, options terminated by --', () => {
  const args = rsyncArgs({ sshTarget: 'mac-mini', remoteProjectsDir: '~/.claude/projects', localDir: '/m/host-abc/default' });
  assert.ok(args.includes('--delete'), 'an exact mirror: a deleted remote Session disappears locally');
  const dash = args.indexOf('--');
  assert.equal(args[dash + 1], 'mac-mini:~/.claude/projects/');
  assert.equal(args[dash + 2], '/m/host-abc/default/');
});

test('rsyncArgs validates the ssh target so a leading-dash target can never become an ssh option', () => {
  assert.throws(() => rsyncArgs({ sshTarget: '-oProxyCommand=touch pwned', remoteProjectsDir: '~/.claude/projects', localDir: '/m' }));
});

// --- change detection -------------------------------------------------------------------------

test('hasRsyncChanges is true only when rsync reported at least one transferred item', () => {
  assert.equal(hasRsyncChanges(''), false);
  assert.equal(hasRsyncChanges('./\n'), false); // the base dir line is not a change
  assert.equal(hasRsyncChanges('-home-me-proj/abc.jsonl\n'), true);
});

// --- source descriptors -----------------------------------------------------------------------

test('sourceDescriptorFor builds one host-qualified Source per Host, keyed by its id', () => {
  const d = sourceDescriptorFor(host(), MIRROR_ROOT);
  assert.equal(d.hostId, 'host-abc');
  assert.equal(d.id, 'ssh:host-abc');
  assert.equal(d.projectsDir, path.join(MIRROR_ROOT, 'host-abc', 'default'));
  assert.equal(d.remoteProjectsDir, '~/.claude/projects');
  assert.equal(d.sshTarget, 'mac-mini');
  // The cache accountId is host-scoped so it can never collide with a Local Account's id.
  assert.match(d.accountId, /host-abc/);
});

test('reconcile yields one descriptor per Host', () => {
  const descriptors = reconcile([host(), host({ id: 'host-2', sshTarget: 'other' })], { mirrorRoot: MIRROR_ROOT });
  assert.deepEqual(descriptors.map(d => d.hostId).sort(), ['host-2', 'host-abc']);
});

// --- payload annotation -----------------------------------------------------------------------

test('annotateProjects names the Host on a remote Project and greys it only when Unreachable', () => {
  const projects = [
    { projectPath: '/home/me/proj', remote: false },
    { projectPath: 'ssh://host-abc/home/me/proj', remote: true, hostId: 'host-abc' },
  ];
  const out = annotateProjects(projects, [host()], { 'host-abc': false });
  assert.equal(out[0].hostName, undefined, 'a local Project is untouched');
  assert.equal(out[0].greyed, undefined);
  assert.equal(out[1].hostName, 'Mac Mini');
  assert.equal(out[1].greyed, true);
});

test('annotateProjects does not grey a Host whose reachability is still unknown', () => {
  const projects = [{ projectPath: 'ssh://host-abc/p', remote: true, hostId: 'host-abc' }];
  const out = annotateProjects(projects, [host()], {}); // never probed
  assert.equal(out[0].greyed, false);
  assert.equal(out[0].hostName, 'Mac Mini');
});
