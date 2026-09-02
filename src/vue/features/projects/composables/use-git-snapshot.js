import { ref, computed } from 'vue';
import { api } from '../../../shared/services/api.js';

// The Git Snapshot concern of the Project Viewer, lifted out of the 869-line View: the branch
// list, the working-tree overview (changed files, commits, containers, remote), the commit box
// and every git action the toolbar and dialogs fire. It owns the `api` git calls so the View
// stays a Dumb assembly. `viewedPath` is the reactive path currently shown (the Project root or
// one of its worktrees); the caller drives it and calls `load()` when it changes.
export function useGitSnapshot(viewedPath) {
  const overview = ref(null);
  const loading = ref(false);

  const branches = ref([]);
  const remoteBranches = ref([]);
  const gitBusy = ref(false);
  const gitMessage = ref('');
  const gitError = ref(false);
  const commitMessage = ref('');
  const generating = ref(false);
  const confirmPush = ref(false);

  // Create-branch dialog
  const showCreateBranch = ref(false);
  const newBranchName = ref('');
  const checkoutBranch = ref(true);

  // README (its path travels on the overview)
  const readmeHtml = ref('');

  // Git user identity
  const gitUser = ref({ name: '', email: '' });

  // The one-letter status and its class for an uncommitted file, read off the added/deleted counts.
  function fileStatus(f) {
    if (!f.added && f.deleted) return 'deleted';
    if (f.added && !f.deleted) return 'added';
    return 'modified';
  }
  function fileStatusChar(f) {
    if (!f.added && f.deleted) return 'D';
    if (f.added && !f.deleted) return 'A';
    return 'M';
  }

  const changedFiles = computed(() => overview.value?.changedFiles || []);
  const unpushedCommits = computed(() => overview.value?.unpushedCommits || []);
  const unpushedCount = computed(() => unpushedCommits.value.length);

  const mrLink = computed(() => {
    const url = overview.value?.remoteUrl;
    if (!url) return null;
    // Normalise SSH → HTTPS: git@host:path.git → https://host/path
    let base = url.trim();
    const ssh = base.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (ssh) base = `https://${ssh[1]}/${ssh[2]}`;
    else base = base.replace(/\.git$/, '');
    if (base.includes('github.com')) {
      return { type: 'github', label: 'Pull Requests', listUrl: `${base}/pulls` };
    }
    if (base.includes('gitlab')) {
      return { type: 'gitlab', label: 'Merge Requests', listUrl: `${base}/-/merge_requests` };
    }
    return null;
  });

  // ── Data loading ────────────────────────────────────────────────
  // Show stale cache immediately (no blank flash), then reconcile against a fresh read of the
  // overview, the branches and the git identity. Returns the fresh overview so the View can
  // reconcile its worktree list against `worktreePaths`.
  async function load() {
    const p = viewedPath.value;
    if (!p) return null;
    commitMessage.value = '';
    readmeHtml.value = '';
    const cached = await api.getProjectGitCache(p).catch(() => null);
    if (cached) {
      overview.value = cached;
      loading.value = false;
    } else {
      overview.value = null;
      loading.value = true;
    }
    const [fresh, br, userInfo] = await Promise.all([
      api.getProjectOverview(p).catch(() => null),
      api.gitBranches(p).catch(() => null),
      api.getGitUserInfo(p).catch(() => null),
    ]);
    overview.value = fresh || overview.value;
    if (fresh) _pushProjectInfo(p, fresh);
    branches.value = br?.ok ? br.branches : [];
    remoteBranches.value = br?.ok ? (br.remotes || []) : [];
    if (userInfo?.ok) gitUser.value = { name: userInfo.name, email: userInfo.email };
    loading.value = false;
    return fresh;
  }

  async function loadReadme() {
    if (readmeHtml.value || !overview.value?.readmePath) return;
    const res = await api.readFileForPanel(overview.value.readmePath).catch(() => null);
    const content = res?.ok ? res.content : '';
    readmeHtml.value = content && window.marked ? window.marked.parse(content) : content;
  }

  // ── Git actions ─────────────────────────────────────────────────
  function showGitMsg(msg, isError = false, ms = 4000) {
    gitMessage.value = msg; gitError.value = isError;
    setTimeout(() => { gitMessage.value = ''; gitError.value = false; }, ms);
  }

  async function switchBranch(branch) {
    if (branch === overview.value?.branch) return;
    gitBusy.value = true;
    const res = await api.gitCheckout(viewedPath.value, branch);
    gitBusy.value = false;
    if (res.ok) { showGitMsg(`Switched to ${branch}`); await reload(); }
    else showGitMsg(res.stderr || 'Checkout failed', true);
  }

  async function doFetch() {
    gitBusy.value = true;
    showGitMsg('Fetching…');
    const res = await api.gitFetch(viewedPath.value);
    gitBusy.value = false;
    if (res.ok) { showGitMsg('Fetched'); const br = await api.gitBranches(viewedPath.value); if (br?.ok) { branches.value = br.branches; remoteBranches.value = br.remotes || []; } }
    else showGitMsg(res.stderr || 'Fetch failed', true);
  }

  async function doPull() {
    gitBusy.value = true;
    showGitMsg('Pulling…');
    const res = await api.gitPull(viewedPath.value);
    gitBusy.value = false;
    if (res.ok) { showGitMsg('Pulled'); await reload(); }
    else showGitMsg(res.stderr || 'Pull failed', true);
  }

  async function generateCommitMsg(style = 'short') {
    generating.value = true; gitBusy.value = true;
    const res = await api.gitGenerateCommitMsg(viewedPath.value, style);
    generating.value = false; gitBusy.value = false;
    if (res.ok) commitMessage.value = res.message;
    else showGitMsg(res.stderr || 'Generation failed', true);
  }

  async function doCommit() {
    if (!commitMessage.value.trim()) return;
    gitBusy.value = true;
    const res = await api.gitCommit(viewedPath.value, commitMessage.value.trim());
    gitBusy.value = false;
    if (res.ok) { showGitMsg('Committed'); commitMessage.value = ''; await reload(); }
    else showGitMsg(res.stderr || 'Commit failed', true);
  }

  async function doPush() {
    confirmPush.value = false;
    gitBusy.value = true;
    showGitMsg('Pushing…');
    const res = await api.gitPush(viewedPath.value);
    gitBusy.value = false;
    if (res.ok) { showGitMsg('Pushed successfully'); await reload(); }
    else showGitMsg(res.stderr || 'Push failed', true);
  }

  async function doCreateBranch() {
    const name = newBranchName.value.trim();
    if (!name) return;
    showCreateBranch.value = false;
    gitBusy.value = true;
    const res = await api.gitCreateBranch(viewedPath.value, name, checkoutBranch.value);
    gitBusy.value = false;
    if (res.ok) {
      showGitMsg(checkoutBranch.value ? `Switched to new branch "${name}"` : `Created branch "${name}"`);
      newBranchName.value = '';
      checkoutBranch.value = true;
      const br = await api.gitBranches(viewedPath.value).catch(() => null);
      if (br?.ok) { branches.value = br.branches; remoteBranches.value = br.remotes || []; }
      await reload();
    } else {
      showGitMsg(res.stderr || 'Failed to create branch', true);
    }
  }

  // A single fresh overview read, used after every mutating git action.
  async function reload() {
    const p = viewedPath.value;
    if (!p) return;
    const fresh = await api.getProjectOverview(p).catch(() => null);
    overview.value = fresh;
    _pushProjectInfo(p, fresh);
  }

  // Overview + branches together — the manual "Refresh" button's payload.
  async function refreshOverview() {
    const p = viewedPath.value;
    if (!p) return;
    const [fresh, br] = await Promise.all([
      api.getProjectOverview(p).catch(() => null),
      api.gitBranches(p).catch(() => null),
    ]);
    if (fresh) overview.value = fresh;
    if (br?.ok) { branches.value = br.branches; remoteBranches.value = br.remotes || []; }
    _pushProjectInfo(p, fresh);
  }

  // Overview only, no project-info push — the quiet periodic refresh while sessions run.
  async function refreshOverviewSilent() {
    const p = viewedPath.value;
    if (!p) return;
    const fresh = await api.getProjectOverview(p).catch(() => null);
    if (fresh) overview.value = fresh;
  }

  function _pushProjectInfo(path, fresh) {
    if (!fresh) return;
    window.vueProjects?.updateProjectInfo?.(path, {
      branch: fresh.branch,
      added: fresh.totalAdded,
      deleted: fresh.totalDeleted,
      unpushedCount: fresh.unpushedCommits?.length ?? 0,
      containers: fresh.containers,
    });
  }

  function openExternal(url) { api.openExternal?.(url); }

  // Delete a worktree and its branch. The View owns the worktree list and folds the result in;
  // this is only the git call, kept beside the rest of the git plumbing.
  async function removeWorktree(rootPath, wtPath) {
    return api.deleteWorktree(rootPath, wtPath);
  }

  function reset() {
    overview.value = null;
  }

  return {
    overview, loading,
    branches, remoteBranches, gitBusy, gitMessage, gitError,
    commitMessage, generating, confirmPush,
    showCreateBranch, newBranchName, checkoutBranch,
    readmeHtml, gitUser,
    changedFiles, unpushedCommits, unpushedCount, mrLink,
    fileStatus, fileStatusChar,
    load, loadReadme, reload, refreshOverview, refreshOverviewSilent,
    switchBranch, doFetch, doPull, generateCommitMsg, doCommit, doPush, doCreateBranch,
    showGitMsg, openExternal, removeWorktree, reset,
  };
}
