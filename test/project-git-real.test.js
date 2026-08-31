// The fixtures in project-git.test.js are recordings of what git prints. These few tests
// run the real binary against a throwaway repository so those recordings stay honest —
// they anchor output formats, not user journeys, which is why they live here and not in e2e/.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const { createProjectGit } = require('../project-git');

// The same shape main.js injects, minus the WSL re-targeting: argv, no shell, never rejects.
const git = createProjectGit({
  run: (argv, cwd, { timeout } = {}) => new Promise(resolve => {
    execFile('git', argv, { cwd, timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
  }),
});

function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-git-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...argv) => execFileSync('git', argv, { cwd: dir, stdio: 'ignore' });
  run('init', '-b', 'main');
  run('config', 'user.name', 'Test User');
  run('config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  run('add', '-A');
  run('commit', '-m', 'chore: first');
  return { dir, run };
}

test('a real repository yields a Snapshot whose shape matches the recorded fixtures', async (t) => {
  const { dir, run } = makeRepo(t);
  run('tag', 'v1.0.0');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\nworld\n');
  fs.writeFileSync(path.join(dir, 'a file with spaces.txt'), 'new\n');

  const snap = await git.snapshot(dir);

  assert.equal(snap.ok, true);
  assert.equal(snap.branch, 'main');
  assert.equal(snap.upstream, null, 'a fresh repo has no upstream');
  assert.deepEqual(snap.tags, ['v1.0.0']);
  assert.deepEqual(snap.worktreePaths, []);
  assert.equal(snap.commits.length, 1);
  assert.equal(snap.commits[0].message, 'chore: first');
  assert.equal(snap.commits[0].author, 'Test User');
  assert.match(snap.commits[0].hash, /^[0-9a-f]{7,}$/);
  assert.deepEqual(snap.changedFiles, [{ file: 'README.md', added: 1, deleted: 0 }]);
  assert.equal(snap.totalAdded, 1);

  const light = await git.lightSnapshot(dir);
  assert.deepEqual(light, { ok: true, branch: 'main', added: 1, deleted: null });
});

test('a real file whose name contains a space reads back at HEAD', async (t) => {
  const { dir, run } = makeRepo(t);
  const name = 'src/a file with spaces.txt';
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, name), 'committed\n');
  run('add', '-A');
  run('commit', '-m', 'feat: spaced');
  fs.writeFileSync(path.join(dir, name), 'edited\n');

  const shown = await git.showFile(dir, name);
  assert.equal(shown.ok, true);
  assert.equal(shown.content, 'committed\n', 'a spaced filename must not read as new');

  const missing = await git.showFile(dir, 'src/never-committed.txt');
  assert.equal(missing.ok, false);
});

test('a real Worktree is listed, then removed with its branch, then removed again quietly', async (t) => {
  const { dir, run } = makeRepo(t);
  const worktree = path.join(dir, '.claude', 'worktrees', 'feat');
  run('worktree', 'add', '-b', 'feat', worktree);

  const listed = await git.snapshot(dir);
  assert.deepEqual(listed.worktreePaths.map(p => fs.realpathSync(p)), [fs.realpathSync(worktree)]);

  const removed = await git.removeWorktree(dir, worktree);
  assert.deepEqual(removed, { ok: true, branch: 'feat' });
  assert.equal(fs.existsSync(worktree), false);

  const after = await git.snapshot(dir);
  assert.deepEqual(after.worktreePaths, []);
  const branches = await git.branches(dir);
  assert.deepEqual(branches.branches, ['main'], 'the branch goes with the Worktree');

  // The same call again: the path is no longer a worktree, and that is not a failure.
  assert.equal((await git.removeWorktree(dir, worktree)).ok, true);
});

test('a real push with no remote configured fails without throwing', async (t) => {
  const { dir } = makeRepo(t);

  const res = await git.push(dir);
  assert.equal(res.ok, false);
  assert.equal(typeof res.code, 'number');
  assert.ok(res.stderr.length > 0, 'the failure carries something displayable');
});

test('a folder that is not a repository yields an empty Snapshot from the real binary', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-git-bare-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const snap = await git.snapshot(dir);
  assert.equal(snap.ok, true);
  assert.equal(snap.branch, null);
  // Absent, not empty: the panel must not read this as "your Worktrees are gone".
  assert.equal('worktreePaths' in snap, false);
  assert.equal((await git.branches(dir)).ok, false);
});
