// The single place that knows how to invoke git.
// Pure Node — no fs, no Electron, no db: the caller injects the runner, which is what
// keeps this reachable from `node --test` and what lets a WSL-backed account re-target
// every command into its distribution. See docs/adr/0007.
//
// Two rules hold the module together: commands are argv arrays run without a shell, and
// nothing here ever throws. Git reports information through exit codes — a branch with no
// upstream, a worktree already gone — so deciding what counts as a failure is the caller's.

const LOCAL_TIMEOUT_MS = 5000;
const NETWORK_TIMEOUT_MS = 30000;

const FIELD = '\x1f';
const COMMIT_FORMAT = `--format=%h${FIELD}%s${FIELD}%an${FIELD}%ar`;
const RECENT_COMMITS = 15;
const MAX_TAGS = 20;

// Deleting the branch a Worktree sat on is fine; deleting these is not.
const PROTECTED_BRANCHES = new Set(['HEAD', 'main', 'master']);

// `git worktree remove --force` on a worktree whose directory is gone exits 0, so the
// common idempotent case needs nothing. A path that was never a worktree exits 128 with
// this text — the same code as a genuine failure. Git draws no distinction, so we match
// the string. It is a constraint git imposes, not a choice, and the only one left here.
const NOT_A_WORKTREE = /is not a working tree|not a git/;

function parseCommits(stdout) {
  return (stdout || '').trim().split('\n').filter(Boolean).map(line => {
    const [hash, message, author, date] = line.split(FIELD);
    return { hash, message, author, date };
  });
}

// The first block of `worktree list --porcelain` is the main worktree, which is the
// Project itself and never a Worktree in the app's sense.
function parseWorktreePaths(stdout) {
  return (stdout || '').trim().split('\n\n').slice(1).map(block => {
    const match = block.match(/^worktree (.+)/m);
    return match ? match[1].trim() : null;
  }).filter(Boolean);
}

function parseNumstat(stdout) {
  const files = (stdout || '').trim().split('\n').filter(Boolean).map(line => {
    const [added, deleted, file] = line.split('\t');
    return { file, added: parseInt(added) || 0, deleted: parseInt(deleted) || 0 };
  });
  files.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));
  return {
    changedFiles: files,
    totalAdded: files.reduce((n, f) => n + f.added, 0),
    totalDeleted: files.reduce((n, f) => n + f.deleted, 0),
  };
}

function parseShortstat(stdout) {
  const added = (stdout || '').match(/(\d+) insertion/);
  const deleted = (stdout || '').match(/(\d+) deletion/);
  return {
    added: added ? parseInt(added[1]) : null,
    deleted: deleted ? parseInt(deleted[1]) : null,
  };
}

function parseLocalBranches(stdout) {
  return (stdout || '').trim().split('\n')
    .map(b => b.replace(/^[*+]\s*/, '').trim())
    .filter(Boolean);
}

// Remotes are shown without their `origin/` prefix and only when no local branch already
// carries the name — the panel offers them as branches to create, not as refs to inspect.
function parseRemoteBranches(stdout, localBranches) {
  return (stdout || '').trim().split('\n')
    .map(b => b.trim().replace(/^origin\//, ''))
    .filter(b => b && b !== 'HEAD' && !b.includes('->') && !localBranches.includes(b));
}

function createProjectGit({ run }) {
  // The runner is injected and may be anything; a rejection here would surface as an
  // unhandled rejection in the renderer's `res.ok`, so it is flattened into an exit code.
  async function git(argv, cwd, timeout) {
    try {
      const res = await run(argv, cwd, { timeout });
      return {
        code: res?.code ?? 0,
        stdout: res?.stdout ?? '',
        stderr: res?.stderr ?? '',
      };
    } catch (err) {
      return { code: -1, stdout: '', stderr: err?.message || String(err) };
    }
  }

  const local = (argv, cwd) => git(argv, cwd, LOCAL_TIMEOUT_MS);
  const network = (argv, cwd) => git(argv, cwd, NETWORK_TIMEOUT_MS);

  const failed = res => ({ ok: false, code: res.code, stderr: (res.stderr || '').trim() });
  const text = res => (res.stdout || '').trim();
  const ran = async (argv, cwd) => {
    const res = await local(argv, cwd);
    return res.code === 0 ? { ok: true } : failed(res);
  };

  // The sidebar badge: a branch and the size of the working diff, nothing more.
  async function lightSnapshot(projectPath) {
    const [head, shortstat] = [
      await local(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath),
      await local(['diff', '--shortstat', 'HEAD'], projectPath),
    ];
    const counts = shortstat.code === 0 ? parseShortstat(shortstat.stdout) : { added: null, deleted: null };
    return { ok: true, branch: head.code === 0 ? text(head) : null, ...counts };
  }

  // The Project Viewer's whole reading, assigned wholesale and re-read after every
  // mutation. A folder that is not a repository comes back empty rather than failing:
  // the panel renders the empty shape, and every field below is independently optional.
  async function fullSnapshot(projectPath) {
    // worktreePaths is deliberately absent until git actually answers. The Project
    // Viewer reconciles its Worktree list against this field and deletes every one it
    // no longer sees, so an empty list from a failed read would delete live Worktrees.
    // Absent means "unknown" and skips the reconciliation; [] means "git says none".
    const snap = {
      ok: true,
      branch: null, upstream: null, remoteUrl: null,
      tags: [], commits: [], unpushedCommits: [],
      changedFiles: [], totalAdded: 0, totalDeleted: 0,
    };

    const head = await local(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    if (head.code !== 0) return snap;
    snap.branch = text(head);

    const log = await local(['log', COMMIT_FORMAT, `-${RECENT_COMMITS}`], projectPath);
    if (log.code === 0) snap.commits = parseCommits(log.stdout);

    const upstream = await local(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], projectPath);
    if (upstream.code === 0) {
      snap.upstream = text(upstream);
      const unpushed = await local(['log', COMMIT_FORMAT, '@{u}..HEAD'], projectPath);
      if (unpushed.code === 0) snap.unpushedCommits = parseCommits(unpushed.stdout);
      const named = await local(['remote', 'get-url', snap.upstream.split('/')[0]], projectPath);
      if (named.code === 0) snap.remoteUrl = text(named);
    }
    if (!snap.remoteUrl) {
      const origin = await local(['remote', 'get-url', 'origin'], projectPath);
      if (origin.code === 0) snap.remoteUrl = text(origin);
    }

    const tags = await local(['tag', '--sort=-version:refname'], projectPath);
    if (tags.code === 0) snap.tags = text(tags).split('\n').filter(Boolean).slice(0, MAX_TAGS);

    const worktrees = await local(['worktree', 'list', '--porcelain'], projectPath);
    if (worktrees.code === 0) snap.worktreePaths = parseWorktreePaths(worktrees.stdout);

    const numstat = await local(['diff', '--numstat', 'HEAD'], projectPath);
    if (numstat.code === 0) Object.assign(snap, parseNumstat(numstat.stdout));

    return snap;
  }

  return {
    snapshot(projectPath, { depth = 'full' } = {}) {
      return depth === 'light' ? lightSnapshot(projectPath) : fullSnapshot(projectPath);
    },

    async branches(projectPath) {
      const listed = await local(['branch'], projectPath);
      if (listed.code !== 0) return failed(listed);
      const branches = parseLocalBranches(listed.stdout);
      const remote = await local(['branch', '-r'], projectPath);
      return {
        ok: true,
        branches,
        remotes: remote.code === 0 ? parseRemoteBranches(remote.stdout, branches) : [],
      };
    },

    async diff(projectPath) {
      const res = await local(['diff', 'HEAD'], projectPath);
      return res.code === 0 ? { ok: true, diff: res.stdout } : failed(res);
    },

    async showFile(projectPath, filePath) {
      const res = await local(['show', `HEAD:${filePath}`], projectPath);
      return res.code === 0 ? { ok: true, content: res.stdout } : failed(res);
    },

    // Failure is an answer here — a repository with no identity configured is ordinary —
    // so the empty strings come back alongside `ok: false` rather than instead of a result.
    async userInfo(projectPath) {
      const name = await local(['config', 'user.name'], projectPath);
      const email = await local(['config', 'user.email'], projectPath);
      if (name.code !== 0 || email.code !== 0) return { ok: false, name: '', email: '' };
      return { ok: true, name: text(name), email: text(email) };
    },

    checkout(projectPath, branch) {
      return ran(['checkout', branch], projectPath);
    },

    createBranch(projectPath, branchName, { checkout = true } = {}) {
      return ran(checkout ? ['checkout', '-b', branchName] : ['branch', branchName], projectPath);
    },

    async commit(projectPath, message) {
      const staged = await local(['add', '-A'], projectPath);
      if (staged.code !== 0) return failed(staged);
      return ran(['commit', '-m', message], projectPath);
    },

    async fetch(projectPath) {
      const res = await network(['fetch', '--prune'], projectPath);
      return res.code === 0 ? { ok: true } : failed(res);
    },

    async pull(projectPath) {
      const res = await network(['pull'], projectPath);
      return res.code === 0 ? { ok: true } : failed(res);
    },

    // A branch with no upstream is the common first push, not an error — retry naming one.
    // If the retry fails too, its own message is the one that describes what went wrong.
    async push(projectPath) {
      const first = await network(['push'], projectPath);
      if (first.code === 0) return { ok: true };

      const head = await local(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
      if (head.code !== 0) return failed(first);

      const retry = await network(['push', '--set-upstream', 'origin', text(head)], projectPath);
      return retry.code === 0 ? { ok: true } : failed(retry);
    },

    // The one destructive operation in the app. It reads the branch first, because once
    // the worktree is gone there is nothing left to ask.
    async removeWorktree(projectPath, worktreePath) {
      const head = await local(['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
      const branch = head.code === 0 ? text(head) : null;

      const removed = await local(['worktree', 'remove', worktreePath, '--force'], projectPath);
      if (removed.code !== 0 && !NOT_A_WORKTREE.test(removed.stderr)) return failed(removed);

      await local(['worktree', 'prune'], projectPath);
      if (branch && !PROTECTED_BRANCHES.has(branch)) {
        await local(['branch', '-D', branch], projectPath);
      }
      return { ok: true, branch };
    },
  };
}

module.exports = { createProjectGit, LOCAL_TIMEOUT_MS, NETWORK_TIMEOUT_MS };
