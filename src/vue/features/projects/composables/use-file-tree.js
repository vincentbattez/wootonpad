import { ref, computed } from 'vue';
import { api } from '../../../shared/services/api.js';

// The Project Viewer's Files tab: the lazy directory tree and its live filter. Split out so the
// tree can change without reading the Git Snapshot or the diff overlay it used to share a file
// with. Owns the `getFileTree` call; `viewedPath` is the Project root or worktree in view.
export function useFileTree(viewedPath) {
  const fileTree = ref([]);
  const treeLoading = ref(false);
  const treeSearch = ref('');

  const filteredTree = computed(() => {
    if (!treeSearch.value) return fileTree.value;
    return filterTree(fileTree.value, treeSearch.value.toLowerCase());
  });

  function filterTree(nodes, q) {
    const result = [];
    for (const n of nodes) {
      if (n.isDir) {
        const children = filterTree(n.children || [], q);
        if (children.length) result.push({ ...n, children, _expanded: true });
      } else if (n.name.toLowerCase().includes(q)) {
        result.push(n);
      }
    }
    return result;
  }

  // Fetch once per viewed path; the caller guards re-entry by only calling when empty.
  async function loadTree() {
    if (fileTree.value.length || !viewedPath.value) return;
    treeLoading.value = true;
    const res = await api.getFileTree(viewedPath.value).catch(() => null);
    if (res?.ok) fileTree.value = res.tree;
    treeLoading.value = false;
  }

  // Drop the cached tree so the next Files-tab visit reloads for the new path.
  function reset() {
    fileTree.value = [];
  }

  return { fileTree, treeLoading, treeSearch, filteredTree, loadTree, reset };
}
