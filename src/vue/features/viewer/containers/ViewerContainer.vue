<template>
  <ViewerToolbar
    :title="title"
    :path="currentFilePath"
    :is-markdown="isMarkdown"
    :preview-mode="previewMode"
    :wrap-mode="wrapMode"
    :show-copy-path="showCopyPath"
    :show-copy-content="showCopyContent"
    :can-save="!!onSave"
    :can-close="!!onClose"
    :save-flash="saveFlash"
    :copy-path-flash="copyPathFlash"
    :copy-content-flash="copyContentFlash"
    @toggle-preview="togglePreview"
    @toggle-wrap="toggleWrap"
    @goto-line="doGotoLine"
    @save="doSave"
    @close="onClose"
    @copy-path="doCopyPath"
    @copy-content="doCopyContent"
  />
  <SbEditor ref="editorRef" :preview-mode="previewMode" :preview-html="previewHtml" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import ViewerToolbar from '../components/ViewerToolbar.vue';
import SbEditor from '../../../shared/ui/SbEditor.vue';
import { viewerStore } from '../store.js';

// The viewer Feature's single edge. It owns the CodeMirror integration, the file watching and the
// IPC, and renders the Dumb toolbar and editor surface around them. The frozen file panel drives
// it through the Feature Bridge (bridged=true, watching the store); the plan and memory viewers
// still drive it through the exposed open/destroy for now.
const props = defineProps({
  language: { type: String, default: 'markdown' },
  storageKey: String,
  showCopyPath: Boolean,
  showCopyContent: Boolean,
  onSave: Function,
  onClose: Function,
  bridged: Boolean,
});

const editorRef = ref(null);
const host = () => editorRef.value?.editorEl;

const title = ref('');
const currentFilePath = ref('');
const previewMode = ref(false);
const previewHtml = ref('');
const wrapMode = ref(false);
const saveFlash = ref(false);
const copyPathFlash = ref(false);
const copyContentFlash = ref(false);

let editorView = null;
let watchedPath = null;
let saving = false;

const isMarkdown = computed(() => {
  if (!currentFilePath.value) return props.language === 'markdown';
  const ext = currentFilePath.value.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx' || props.language === 'markdown';
});

onMounted(() => {
  if (props.storageKey) {
    previewMode.value = localStorage.getItem(props.storageKey) === 'true';
  }
  if (window.api?.onFileChanged) {
    window.api.onFileChanged(onFileChanged);
  }
  host()?.addEventListener('cm-save', doSave);

  // A bridged Container is the frozen file panel's viewer: it reacts to the Feature store the
  // Bridge writes, instead of being driven through the exposed methods.
  if (props.bridged) {
    watch(() => viewerStore.openRequest, (req) => {
      if (req) open(req.title, req.filePath, req.content);
    });
    watch(() => viewerStore.destroySeq, () => destroy());
  }
});

onUnmounted(() => {
  host()?.removeEventListener('cm-save', doSave);
  unwatchFile();
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
});

function onFileChanged(changedPath) {
  if (changedPath === watchedPath && !saving) reloadFromDisk();
}

function open(newTitle, filePath, content) {
  unwatchFile();
  currentFilePath.value = filePath;
  title.value = newTitle;

  const ext = filePath?.split('.').pop()?.toLowerCase();
  const isMd = ext === 'md' || ext === 'mdx' || props.language === 'markdown';
  const wantPreview = isMd && props.storageKey && localStorage.getItem(props.storageKey) === 'true';

  // Exit preview without touching localStorage
  if (previewMode.value) {
    previewMode.value = false;
    previewHtml.value = '';
  }

  wrapMode.value = isMd;

  if (!editorView) {
    createEditor(content, filePath, isMd);
  } else {
    setDocContent(content);
    applyWrap(wrapMode.value);
  }

  if (wantPreview) showPreview();
  watchFile(filePath);
}

function createEditor(content, filePath, isMd) {
  if (props.language === 'auto') {
    editorView = window.createEditableViewer(host(), content, filePath, { wrap: isMd });
  } else {
    editorView = window.createPlanEditor(host());
    if (content) setDocContent(content);
    applyWrap(isMd);
  }
}

// Replace the editor's whole document. Callers guarantee editorView exists.
function setDocContent(text) {
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: text },
  });
}

// Turn line wrapping on or off, if the active editor exposes a wrap compartment.
function applyWrap(wrap) {
  if (!editorView?._wrapCompartment) return;
  editorView.dispatch({
    effects: editorView._wrapCompartment.reconfigure(
      wrap ? window.CMEditorView.lineWrapping : []
    ),
  });
}

function destroy() {
  unwatchFile();
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  const el = host();
  if (el) {
    delete el._cmSearchBar;
    delete el._cmGotoLine;
    el.innerHTML = '';
  }
  previewHtml.value = '';
  previewMode.value = false;
  title.value = '';
  currentFilePath.value = '';
}

function getContent() {
  return editorView ? editorView.state.doc.toString() : '';
}

function togglePreview() {
  if (!previewMode.value) showPreview(); else hidePreview();
}

function showPreview() {
  const content = getContent();
  previewHtml.value = window.marked?.parse(content) || content;
  previewMode.value = true;
  if (props.storageKey) localStorage.setItem(props.storageKey, 'true');
}

function hidePreview() {
  previewMode.value = false;
  if (props.storageKey) localStorage.setItem(props.storageKey, 'false');
}

function toggleWrap() {
  if (!editorView?._wrapCompartment) return;
  wrapMode.value = !wrapMode.value;
  applyWrap(wrapMode.value);
}

function doGotoLine() {
  if (editorView && window.cmOpenGotoLine) window.cmOpenGotoLine(editorView);
}

async function doSave() {
  if (!props.onSave || !currentFilePath.value) return;
  saving = true;
  const content = getContent();
  try {
    const result = await props.onSave(currentFilePath.value, content);
    if (!result || result.ok !== false) flash('save');
  } finally {
    setTimeout(() => { saving = false; }, 500);
  }
}

function doCopyPath() {
  navigator.clipboard.writeText(currentFilePath.value);
  flash('copyPath');
}

function doCopyContent() {
  navigator.clipboard.writeText(getContent());
  flash('copyContent');
}

function flash(type) {
  const map = { save: saveFlash, copyPath: copyPathFlash, copyContent: copyContentFlash };
  const r = map[type];
  if (!r) return;
  r.value = true;
  setTimeout(() => { r.value = false; }, 1200);
}

function watchFile(filePath) {
  if (!filePath || !window.api?.watchFile) return;
  watchedPath = filePath;
  window.api.watchFile(filePath);
}

function unwatchFile() {
  if (watchedPath && window.api?.unwatchFile) {
    window.api.unwatchFile(watchedPath);
    watchedPath = null;
  }
}

async function reloadFromDisk() {
  if (!currentFilePath.value || !window.api?.readFileForPanel) return;
  const result = await window.api.readFileForPanel(currentFilePath.value);
  if (!result?.ok) return;
  const newContent = result.content;
  if (newContent === getContent()) return;
  if (editorView) setDocContent(newContent);
  if (previewMode.value) {
    previewHtml.value = window.marked?.parse(newContent) || newContent;
  }
}

defineExpose({ open, destroy, getContent });
</script>
