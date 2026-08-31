const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProjectGit,
  LOCAL_TIMEOUT_MS,
  NETWORK_TIMEOUT_MS,
} = require('../project-git');

const PROJECT = '/tmp/proj';
const F = '\x1f';

// A fake git: an argv maps to what git would have printed. Anything unlisted exits 1,
// which is how "this is not a repository" reaches the module.
//
// An argument holding whitespace is keyed quoted, so an argv that split it — the shell
// interpolation this module exists to make impossible — misses the table and comes back
// as a failed result. The quoting question is answerable from the result alone.
function argvKey(argv) {
  return argv.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

function fakeGit(table = {}, { onCall } = {}) {
  const calls = [];
  const run = (argv, cwd, options = {}) => {
    calls.push({ argv, cwd, timeout: options.timeout });
    if (onCall) {
      const early = onCall(argv, calls.length);
      if (early) return Promise.resolve({ code: 0, stdout: '', stderr: '', ...early });
    }
    const key = argvKey(argv);
    const hit = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
    if (hit === null) return Promise.resolve({ code: 1, stdout: '', stderr: `fatal: unknown: ${key}` });
    if (typeof hit === 'string') return Promise.resolve({ code: 0, stdout: hit, stderr: '' });
    return Promise.resolve({ code: 0, stdout: '', stderr: '', ...hit });
  };
  return { git: createProjectGit({ run }), calls };
}

// A fake git that keeps state instead of answers, for the one destructive operation:
// what `removeWorktree` did to the branches is then read back through `branches()`.
function fakeRepo({ branch = 'feat', removal = { code: 0 } } = {}) {
  const branches = new Set(['main', branch].filter(Boolean));
  const answer = (stdout, code = 0) => Promise.resolve({ code, stdout, stderr: '' });
  const run = (argv) => {
    const [head, second] = argv;
    if (head === '-C') return answer(branch ? `${branch}\n` : '', branch ? 0 : 128);
    if (head === 'worktree' && second === 'remove') return Promise.resolve({ stdout: '', stderr: '', ...removal });
    if (head === 'worktree' && second === 'prune') return answer('');
    if (head === 'branch' && second === '-D') { branches.delete(argv[2]); return answer(''); }
    if (head === 'branch' && argv.length === 1) return answer([...branches].map(b => `  ${b}`).join('\n') + '\n');
    return answer('');
  };
  return createProjectGit({ run });
}

const HEAD_BRANCH = 'rev-parse --abbrev-ref HEAD';
const LOG_15 = `log --format=%h${F}%s${F}%an${F}%ar -15`;
const LOG_UNPUSHED = `log --format=%h${F}%s${F}%an${F}%ar @{u}..HEAD`;
const UPSTREAM = 'rev-parse --abbrev-ref --symbolic-full-name @{u}';

const FULL_REPO = {
  [HEAD_BRANCH]: 'feature/vin-91\n',
  [LOG_15]: `abc1234${F}feat: ship it${F}Vincent${F}2 hours ago\ndef5678${F}fix: repair it${F}Ada${F}3 days ago\n`,
  [LOG_UNPUSHED]: `abc1234${F}feat: ship it${F}Vincent${F}2 hours ago\n`,
  [UPSTREAM]: 'origin/feature/vin-91\n',
  'remote get-url origin': 'git@github.com:vincentbattez/wootonpad.git\n',
  'tag --sort=-version:refname': 'v2.0.0\nv1.9.0\n',
  'worktree list --porcelain':
    'worktree /tmp/proj\nHEAD abc1234\nbranch refs/heads/main\n\n' +
    'worktree /tmp/proj/.claude/worktrees/feat\nHEAD def5678\nbranch refs/heads/feat\n',
  'diff --numstat HEAD': '4\t2\tmain.js\n30\t0\tproject-git.js\n',
  'diff --shortstat HEAD': ' 2 files changed, 34 insertions(+), 2 deletions(-)\n',
};

// ── Full Snapshot ─────────────────────────────────────────────────

test('a full Snapshot reads branch, commits, upstream, remote, tags and worktrees', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.ok, true);
  assert.equal(snap.branch, 'feature/vin-91');
  assert.equal(snap.upstream, 'origin/feature/vin-91');
  assert.equal(snap.remoteUrl, 'git@github.com:vincentbattez/wootonpad.git');
  assert.deepEqual(snap.tags, ['v2.0.0', 'v1.9.0']);
});

test('a full Snapshot parses the commit list into hash, message, author and date', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.snapshot(PROJECT);

  assert.deepEqual(snap.commits[0], {
    hash: 'abc1234', message: 'feat: ship it', author: 'Vincent', date: '2 hours ago',
  });
  assert.equal(snap.commits.length, 2);
  assert.equal(snap.unpushedCommits.length, 1);
  assert.equal(snap.unpushedCommits[0].hash, 'abc1234');
});

test('a full Snapshot totals the changed files and sorts the busiest first', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.snapshot(PROJECT);

  assert.deepEqual(snap.changedFiles, [
    { file: 'project-git.js', added: 30, deleted: 0 },
    { file: 'main.js', added: 4, deleted: 2 },
  ]);
  assert.equal(snap.totalAdded, 34);
  assert.equal(snap.totalDeleted, 2);
});

test('a full Snapshot lists the Worktree paths and never the main worktree', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.snapshot(PROJECT);

  assert.deepEqual(snap.worktreePaths, ['/tmp/proj/.claude/worktrees/feat']);
});

test('a repository with no Worktree yields an empty Worktree list, not a missing one', async () => {
  const { git } = fakeGit({
    ...FULL_REPO,
    'worktree list --porcelain': 'worktree /tmp/proj\nHEAD abc1234\nbranch refs/heads/main\n',
  });
  const snap = await git.snapshot(PROJECT);

  assert.deepEqual(snap.worktreePaths, []);
});

// The Project Viewer deletes every Worktree missing from this field, so "git did not
// answer" must not arrive looking like "git says there are none".
test('a Worktree listing that fails leaves the field absent rather than empty', async () => {
  const unreadable = { ...FULL_REPO };
  delete unreadable['worktree list --porcelain'];
  const { git } = fakeGit(unreadable);
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.ok, true);
  assert.equal('worktreePaths' in snap, false);
  assert.equal(snap.branch, 'feature/vin-91', 'the rest of the Snapshot still arrives');
});

test('a folder that is not a repository never claims its Worktrees are gone', async () => {
  const { git } = fakeGit({});
  const snap = await git.snapshot(PROJECT);

  assert.equal('worktreePaths' in snap, false);
});

test('a Branch with no upstream still yields a Snapshot, with origin as the remote', async () => {
  const noUpstream = { ...FULL_REPO };
  delete noUpstream[LOG_UNPUSHED];
  delete noUpstream[UPSTREAM];
  const { git } = fakeGit(noUpstream);
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.ok, true);
  assert.equal(snap.upstream, null);
  assert.deepEqual(snap.unpushedCommits, []);
  assert.equal(snap.remoteUrl, 'git@github.com:vincentbattez/wootonpad.git');
});

test('the remote is resolved through the upstream name before falling back to origin', async () => {
  const { git } = fakeGit({
    ...FULL_REPO,
    [UPSTREAM]: 'fork/feature/vin-91\n',
    'remote get-url fork': 'git@github.com:someone/fork.git\n',
  });
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.remoteUrl, 'git@github.com:someone/fork.git');
});

test('a folder that is not a repository yields an empty Snapshot rather than a throw', async () => {
  const { git } = fakeGit({});
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.ok, true);
  assert.equal(snap.branch, null);
  assert.deepEqual(snap.commits, []);
  assert.deepEqual(snap.changedFiles, []);
  assert.deepEqual(snap.tags, []);
  assert.equal(snap.totalAdded, 0);
});

// ── Light Snapshot ────────────────────────────────────────────────

test('a light Snapshot reads only the branch and the insertion counts', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.lightSnapshot(PROJECT);

  assert.deepEqual(snap, { ok: true, branch: 'feature/vin-91', added: 34, deleted: 2 });
});

test('a light Snapshot of an untouched repository reports no insertions', async () => {
  const { git } = fakeGit({ ...FULL_REPO, 'diff --shortstat HEAD': '\n' });
  const snap = await git.lightSnapshot(PROJECT);

  assert.equal(snap.added, null);
  assert.equal(snap.deleted, null);
});

test('a light Snapshot of a folder that is not a repository reports no branch', async () => {
  const { git } = fakeGit({});
  const snap = await git.lightSnapshot(PROJECT);

  assert.deepEqual(snap, { ok: true, branch: null, added: null, deleted: null });
});

test('a Snapshot defaults to the full depth', async () => {
  const { git } = fakeGit(FULL_REPO);
  const snap = await git.snapshot(PROJECT);

  assert.equal(snap.branch, 'feature/vin-91');
  assert.ok(Array.isArray(snap.commits));
});

// ── Branches ──────────────────────────────────────────────────────

test('the Branch listing strips the current marker and hides remotes already local', async () => {
  const { git } = fakeGit({
    branch: '  feature/vin-91\n* main\n+ shared\n',
    'branch -r': '  origin/HEAD -> origin/main\n  origin/main\n  origin/release\n',
  });
  const res = await git.branches(PROJECT);

  assert.equal(res.ok, true);
  assert.deepEqual(res.branches, ['feature/vin-91', 'main', 'shared']);
  assert.deepEqual(res.remotes, ['release']);
});

test('the Branch listing does not advertise a current branch or an error string', async () => {
  const { git } = fakeGit({ branch: '* main\n', 'branch -r': '' });
  const res = await git.branches(PROJECT);

  assert.deepEqual(Object.keys(res).sort(), ['branches', 'ok', 'remotes']);
});

test('a failing Branch listing reports the exit code and stderr, and never throws', async () => {
  const { git } = fakeGit({});
  const res = await git.branches(PROJECT);

  assert.equal(res.ok, false);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /fatal/);
});

test('unreadable remote branches leave the local listing intact', async () => {
  const { git } = fakeGit({ branch: '* main\n' });
  const res = await git.branches(PROJECT);

  assert.equal(res.ok, true);
  assert.deepEqual(res.branches, ['main']);
  assert.deepEqual(res.remotes, []);
});

// ── Reads that feed the panel ─────────────────────────────────────

test('the working diff comes back whole', async () => {
  const { git } = fakeGit({ 'diff HEAD': 'diff --git a/main.js b/main.js\n+one line\n' });
  const res = await git.diff(PROJECT);

  assert.equal(res.ok, true);
  assert.match(res.diff, /^diff --git/);
});

test('a file whose name contains a space is read at HEAD without quoting', async () => {
  const spaced = 'src/my component.vue';
  const { git } = fakeGit({ [`show "HEAD:${spaced}"`]: 'old contents\n' });
  const res = await git.showFile(PROJECT, spaced);

  // Only an argv that kept the name whole reaches the fixture; a split one fails here.
  assert.equal(res.ok, true);
  assert.equal(res.content, 'old contents\n');
});

test('a file absent from HEAD reads as a failure, not as empty content', async () => {
  const { git } = fakeGit({});
  const res = await git.showFile(PROJECT, 'brand-new.js');

  assert.equal(res.ok, false);
  assert.equal(res.code, 1);
});

test('the git identity is read with a timeout, so a hung git cannot wedge the panel', async () => {
  const { git, calls } = fakeGit({
    'config user.name': 'Vincent\n',
    'config user.email': 'vincent@example.com\n',
  });
  const res = await git.userInfo(PROJECT);

  assert.deepEqual(res, { ok: true, name: 'Vincent', email: 'vincent@example.com' });
  assert.ok(calls.every(c => c.timeout === LOCAL_TIMEOUT_MS));
});

test('an unset git identity reports empty strings rather than failing the panel', async () => {
  const { git } = fakeGit({});
  const res = await git.userInfo(PROJECT);

  assert.equal(res.ok, false);
  assert.equal(res.name, '');
  assert.equal(res.email, '');
  assert.equal(res.code, 1, 'the failure keeps the shape every other operation uses');
});

// ── Mutations ─────────────────────────────────────────────────────

test('a Branch name is passed as one argument, whatever it contains', async () => {
  const branch = 'feat/$(rm -rf ~); echo pwned';
  const { git } = fakeGit({ [`checkout ${JSON.stringify(branch)}`]: '' });
  const res = await git.checkout(PROJECT, branch);

  assert.equal(res.ok, true);
});

test('a failed checkout reports the code and stderr', async () => {
  const { git } = fakeGit({}, {
    onCall: () => ({ code: 1, stderr: "error: pathspec 'nope' did not match\n" }),
  });
  const res = await git.checkout(PROJECT, 'nope');

  assert.equal(res.ok, false);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /did not match/);
});

test('a commit stages everything first, and stops if staging fails', async () => {
  // Both fixtures are required: an unstaged commit misses `add -A` and fails.
  const { git } = fakeGit({ 'add -A': '', 'commit -m "ship it"': '' });
  assert.equal((await git.commit(PROJECT, 'ship it')).ok, true);

  // Staging fails, everything else would succeed: a commit that ran anyway would be ok.
  const failing = fakeGit({}, {
    onCall: argv => (argv[0] === 'add'
      ? { code: 128, stderr: 'fatal: index locked\n' }
      : { code: 0 }),
  });
  const bad = await failing.git.commit(PROJECT, 'ship it');
  assert.equal(bad.ok, false);
  assert.match(bad.stderr, /index locked/);
});

test('a commit message travels as one argument, newlines and all', async () => {
  const message = 'feat: ship it\n\n- one\n- two';
  const { git } = fakeGit({ 'add -A': '', [`commit -m ${JSON.stringify(message)}`]: '' });

  assert.equal((await git.commit(PROJECT, message)).ok, true);
});

test('creating a Branch checks it out only when asked', async () => {
  const { git } = fakeGit({ 'checkout -b feat/x': '' });
  assert.equal((await git.createBranch(PROJECT, 'feat/x', { checkout: true })).ok, true);

  const plain = fakeGit({ 'branch feat/x': '' });
  assert.equal((await plain.git.createBranch(PROJECT, 'feat/x', { checkout: false })).ok, true);
});

test('fetch, pull and push get the network timeout; local commands do not', async () => {
  const { git, calls } = fakeGit({}, { onCall: () => ({ code: 0 }) });
  await git.fetch(PROJECT);
  await git.pull(PROJECT);
  await git.push(PROJECT);
  await git.checkout(PROJECT, 'main');

  assert.deepEqual(calls.map(c => c.timeout), [
    NETWORK_TIMEOUT_MS, NETWORK_TIMEOUT_MS, NETWORK_TIMEOUT_MS, LOCAL_TIMEOUT_MS,
  ]);
});

test('a mutation carries no output field, because nothing reads it', async () => {
  const { git } = fakeGit({}, { onCall: () => ({ code: 0, stdout: 'Everything up-to-date\n' }) });

  assert.deepEqual(await git.fetch(PROJECT), { ok: true });
  assert.deepEqual(await git.pull(PROJECT), { ok: true });
  assert.deepEqual(await git.push(PROJECT), { ok: true });
});

// ── Push and its upstream retry ───────────────────────────────────

test('a push on a Branch with no upstream retries with --set-upstream', async () => {
  // The retry is the only argv in the table: any other second push fails.
  const { git, calls } = fakeGit({
    [HEAD_BRANCH]: 'feature/vin-91\n',
    'push --set-upstream origin feature/vin-91': '',
  }, {
    onCall: (_argv, n) => (n === 1
      ? { code: 128, stderr: 'fatal: The current branch has no upstream branch\n' }
      : null),
  });
  const res = await git.push(PROJECT);

  assert.deepEqual(res, { ok: true });
  assert.equal(calls[2].timeout, NETWORK_TIMEOUT_MS);
});

test('a push that fails twice reports the second failure, not the first', async () => {
  const { git } = fakeGit({}, {
    onCall: (argv, n) => {
      if (argv[0] === 'rev-parse') return { code: 0, stdout: 'feature/vin-91\n' };
      return { code: n === 1 ? 128 : 1, stderr: n === 1 ? 'no upstream\n' : 'rejected: non-fast-forward\n' };
    },
  });
  const res = await git.push(PROJECT);

  assert.equal(res.ok, false);
  assert.match(res.stderr, /non-fast-forward/);
});

test('a push whose branch cannot be resolved reports the original push failure', async () => {
  const { git } = fakeGit({}, {
    onCall: (argv) => (argv[0] === 'rev-parse'
      ? { code: 128, stderr: 'fatal: not a repository\n' }
      : { code: 1, stderr: 'push failed\n' }),
  });
  const res = await git.push(PROJECT);

  assert.equal(res.ok, false);
  assert.match(res.stderr, /push failed/);
});

// ── Worktree removal ──────────────────────────────────────────────

test('removing a Worktree returns the branch it was on and deletes it', async () => {
  const git = fakeRepo({ branch: 'feat' });
  const res = await git.removeWorktree(PROJECT, '/tmp/proj/.claude/worktrees/feat');

  assert.deepEqual(res, { ok: true, branch: 'feat' });
  assert.deepEqual((await git.branches(PROJECT)).branches, ['main'], 'the branch went with it');
});

test('removing a Worktree whose directory is already gone succeeds quietly', async () => {
  const WT = '/tmp/proj/.claude/worktrees/gone';
  const { git } = fakeGit({}, {
    onCall: (argv) => (argv[0] === 'worktree' && argv[1] === 'remove' ? { code: 0 } : null),
  });
  const res = await git.removeWorktree(PROJECT, WT);

  assert.equal(res.ok, true);
  assert.equal(res.branch, null);
});

test('removing a path that was never a Worktree is not reported as a failure', async () => {
  const { git } = fakeGit({}, {
    onCall: (argv) => (argv[0] === 'worktree' && argv[1] === 'remove'
      ? { code: 128, stderr: "fatal: '/tmp/nope' is not a working tree\n" }
      : { code: 0 }),
  });
  const res = await git.removeWorktree(PROJECT, '/tmp/nope');

  assert.equal(res.ok, true);
});

test('a Worktree that git refuses to remove for any other reason fails loudly', async () => {
  const git = fakeRepo({
    branch: 'feat',
    removal: { code: 128, stderr: 'fatal: could not lock config file\n' },
  });
  const res = await git.removeWorktree(PROJECT, '/tmp/proj/.claude/worktrees/feat');

  assert.equal(res.ok, false);
  assert.match(res.stderr, /could not lock/);
  assert.deepEqual((await git.branches(PROJECT)).branches, ['main', 'feat'], 'and deletes nothing');
});

test('removing a Worktree never deletes main, master or a detached HEAD', async () => {
  for (const ref of ['main', 'master', 'HEAD']) {
    const git = fakeRepo({ branch: ref });
    const res = await git.removeWorktree(PROJECT, '/tmp/proj/.claude/worktrees/x');

    assert.equal(res.branch, ref);
    const { branches } = await git.branches(PROJECT);
    assert.ok(branches.includes(ref), `deleted ${ref}`);
  }
});

test('a branch that git refuses to delete still leaves the removal successful', async () => {
  const { git } = fakeGit({}, {
    onCall: (argv) => {
      if (argv[0] === '-C') return { code: 0, stdout: 'feat\n' };
      if (argv[0] === 'branch') return { code: 1, stderr: 'error: not fully merged\n' };
      return { code: 0 };
    },
  });
  const res = await git.removeWorktree(PROJECT, '/tmp/proj/.claude/worktrees/feat');

  assert.deepEqual(res, { ok: true, branch: 'feat' });
});

// ── The seam itself ───────────────────────────────────────────────

test('every command runs in the Project and is passed as argv, never as a string', async () => {
  const { git, calls } = fakeGit(FULL_REPO);
  await git.snapshot(PROJECT);
  await git.branches(PROJECT);

  assert.ok(calls.length > 5);
  for (const c of calls) {
    assert.equal(c.cwd, PROJECT);
    assert.ok(Array.isArray(c.argv), 'argv must be an array');
    assert.ok(!c.argv.includes('git'), 'the module owns the binary, callers pass subcommands');
  }
});

test('a runner that rejects is still not allowed to reach the caller', async () => {
  const git = createProjectGit({ run: () => Promise.reject(new Error('spawn ENOENT')) });

  assert.equal((await git.checkout(PROJECT, 'main')).ok, false);
  assert.equal((await git.push(PROJECT)).ok, false);
  assert.equal((await git.snapshot(PROJECT)).ok, true);
  assert.equal((await git.branches(PROJECT)).ok, false);
  assert.equal((await git.removeWorktree(PROJECT, '/tmp/x')).ok, false);
});
