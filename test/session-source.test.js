const test = require('node:test');
const assert = require('node:assert/strict');
const { createSource } = require('../session-source');

test('the local source qualifies a project path and a folder as identity', () => {
  const local = createSource({ id: 'default', projectsDir: '/home/me/.claude/projects', accountId: 'default' });
  assert.equal(local.id, 'default');
  assert.equal(local.accountId, 'default');
  assert.equal(local.hostId, null);
  // Identity: a local Project key is its path, and a local folder is its own name.
  assert.equal(local.qualifyProjectPath('/home/me/work/proj'), '/home/me/work/proj');
  assert.equal(local.qualifyFolder('-home-me-work-proj'), '-home-me-work-proj');
});

test('a remote source qualifies a project path as ssh://<hostId>/<path> (ADR 0016)', () => {
  const remote = createSource({
    id: 'ssh://mac-mini', projectsDir: '/tmp/mirror/mac-mini', accountId: 'mac-mini-default', hostId: 'mac-mini',
  });
  assert.equal(remote.hostId, 'mac-mini');
  assert.equal(remote.qualifyProjectPath('/home/user/work/proj'), 'ssh://mac-mini/home/user/work/proj');
});

test('two sources with the same folder name never collide on their folder identifier', () => {
  const local = createSource({ id: 'default', projectsDir: '/local', accountId: 'default' });
  const remote = createSource({ id: 'ssh://mac-mini', projectsDir: '/mirror', accountId: 'mac-mini', hostId: 'mac-mini' });
  const folder = '-home-me-work-proj';
  assert.notEqual(local.qualifyFolder(folder), remote.qualifyFolder(folder));
  // And the local one stays the bare name, so persisted local rows are untouched.
  assert.equal(local.qualifyFolder(folder), folder);
});

test('a null or empty project path is passed through untouched on any source', () => {
  const remote = createSource({ id: 'ssh://h', projectsDir: '/m', accountId: 'a', hostId: 'h' });
  assert.equal(remote.qualifyProjectPath(null), null);
  assert.equal(remote.qualifyProjectPath(''), '');
});

test('rawFolder inverts qualifyFolder so a qualified key maps back to the on-disk folder name', () => {
  const local = createSource({ id: 'default', projectsDir: '/local', accountId: 'default' });
  const remote = createSource({ id: 'ssh://h', projectsDir: '/m', accountId: 'a', hostId: 'h' });
  const folder = '-home-me-work-proj';
  // Local is identity both ways; remote strips exactly its own host prefix.
  assert.equal(local.rawFolder(local.qualifyFolder(folder)), folder);
  assert.equal(remote.rawFolder(remote.qualifyFolder(folder)), folder);
  // A key that is not this source's is left as-is rather than mangled.
  assert.equal(remote.rawFolder(folder), folder);
});
