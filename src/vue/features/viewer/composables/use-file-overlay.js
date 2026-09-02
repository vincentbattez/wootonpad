import { ref, computed, watch, nextTick } from 'vue';
import { api } from '../../../shared/services/api.js';

// The Project Viewer's full-screen file overlay — a git diff (read-only MergeView) or an editable
// file — routed through the viewer Feature so the CodeMirror integration lives in one place rather
// than a fourth copy inside the View. Owns the `createReadOnlyMergeViewer` / `createEditableViewer`
// wiring and the read/diff/save IPC. `viewedPath` is the Project root or worktree in view;
// `changedFiles` is the Git Snapshot's uncommitted list, which drives prev/next navigation.
export function useFileOverlay(viewedPath, changedFiles) {
  const activeDiff = ref(null);
  const activeFile = ref(null);
  const fileContent = ref('');
  const fileModified = ref(false);
  const fileSaving = ref(false);
  const loadingFile = ref(null);
  const diffContainerRef = ref(null);
  let editorView = null;

  const currentFileIndex = computed(() =>
    changedFiles.value.findIndex(f => f.file === activeDiff.value?.filePath)
  );
  const overlayTitle = computed(() => {
    if (activeDiff.value) return basename(activeDiff.value.filePath);
    if (activeFile.value) return basename(activeFile.value);
    return '';
  });
  const overlayPath = computed(() => activeDiff.value?.filePath || activeFile.value || '');

  function basename(p) { return p ? p.replace(/\\/g, '/').split('/').pop() || p : ''; }

  // Build (or tear down) the CodeMirror surface whenever the shown diff or file changes.
  watch([activeDiff, activeFile], async ([diff, file]) => {
    if (editorView) {
      try { typeof editorView.destroy === 'function' ? editorView.destroy() : editorView.a?.destroy(); } catch {}
      editorView = null;
    }
    if (!diff && !file) return;
    await nextTick();
    const el = diffContainerRef.value;
    if (!el) return;
    el.innerHTML = '';
    if (diff) {
      editorView = window.createReadOnlyMergeViewer?.(el, diff.oldContent, diff.newContent, diff.filePath);
    } else if (file) {
      editorView = window.createEditableViewer?.(el, fileContent.value, file);
      if (editorView) {
        editorView.dom?.addEventListener('input', () => { fileModified.value = true; });
      }
    }
  });

  async function openDiff(filePath) {
    if (loadingFile.value) return;
    loadingFile.value = filePath;
    try {
      const result = await api.getFileDiff(viewedPath.value, filePath);
      if (!result?.ok) return;
      activeFile.value = null;
      activeDiff.value = { filePath, oldContent: result.oldContent, newContent: result.newContent };
    } finally { loadingFile.value = null; }
  }

  async function openFile(path) {
    const fullPath = `${viewedPath.value}/${path}`;
    const res = await api.readFileForPanel(fullPath).catch(() => null);
    if (!res?.ok) return;
    fileContent.value = res.content;
    fileModified.value = false;
    activeDiff.value = null;
    activeFile.value = fullPath;
  }

  async function saveFile() {
    if (!activeFile.value || !editorView) return;
    fileSaving.value = true;
    const content = editorView.state?.doc?.toString?.() ?? fileContent.value;
    await api.saveFileForPanel(activeFile.value, content).catch(() => {});
    fileModified.value = false;
    fileSaving.value = false;
  }

  function close() {
    activeDiff.value = null;
    activeFile.value = null;
  }
  function prevFile() {
    const i = currentFileIndex.value;
    if (i > 0) openDiff(changedFiles.value[i - 1].file);
  }
  function nextFile() {
    const i = currentFileIndex.value;
    if (i < changedFiles.value.length - 1) openDiff(changedFiles.value[i + 1].file);
  }

  return {
    activeDiff, activeFile, fileContent, fileModified, fileSaving, loadingFile, diffContainerRef,
    currentFileIndex, overlayTitle, overlayPath,
    openDiff, openFile, saveFile, close, prevFile, nextFile,
  };
}
