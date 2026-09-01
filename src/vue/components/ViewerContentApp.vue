<template>
  <div class="viewer-toolbar">
    <div class="viewer-toolbar-info">
      <span class="viewer-toolbar-title">{{ title }}</span>
      <span class="viewer-toolbar-path">{{ currentFilePath }}</span>
      <button
        v-if="showCopyPath"
        class="viewer-toolbar-copy-path"
        :style="copyPathFlash ? FLASH_STYLE : {}"
        title="Copy file path"
        @click="doCopyPath"
        v-html="COPY_ICON"
      ></button>
    </div>
    <div class="viewer-toolbar-controls">
      <button
        v-show="isMarkdown"
        class="fp-toolbar-btn fp-icon-btn"
        :class="{ active: previewMode }"
        :title="previewMode ? 'Back to editor' : 'Toggle markdown preview'"
        @click="togglePreview"
        v-html="PREVIEW_ICON"
      ></button>
      <button
        v-if="showCopyContent"
        class="fp-toolbar-btn fp-icon-btn"
        :style="copyContentFlash ? FLASH_STYLE : {}"
        title="Copy raw content"
        @click="doCopyContent"
        v-html="COPY_ICON"
      ></button>
      <button
        class="fp-toolbar-btn fp-icon-btn"
        :class="{ active: wrapMode }"
        title="Toggle line wrapping"
        @click="toggleWrap"
        v-html="WRAP_ICON"
      ></button>
      <button
        class="fp-toolbar-btn fp-icon-btn"
        title="Go to line (Cmd+G)"
        @click="doGotoLine"
        v-html="GOTO_LINE_ICON"
      ></button>
      <button
        v-if="onSave"
        class="fp-toolbar-btn fp-save-btn fp-icon-btn"
        :style="saveFlash ? FLASH_STYLE : {}"
        title="Save changes"
        @click="doSave"
        v-html="SAVE_ICON"
      ></button>
      <button
        v-if="onClose"
        class="fp-toolbar-btn fp-close-btn fp-icon-btn"
        title="Close panel"
        @click="onClose"
        v-html="CLOSE_ICON"
      ></button>
    </div>
  </div>
  <div ref="editorEl" class="viewer-panel-editor" :style="previewMode ? { display: 'none' } : {}"></div>
  <div ref="previewEl" class="markdown-preview" v-show="previewMode"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { viewerIcons } from '../shared/lib/icons.js';
import { api } from '../shared/services/api.js';
const { SAVE_ICON, WRAP_ICON, COPY_ICON, PREVIEW_ICON, GOTO_LINE_ICON, CLOSE_ICON } = viewerIcons;

const FLASH_STYLE = { color: '#3ecf5a', borderColor: 'rgba(62,207,90,0.4)' };

const props = defineProps({
  language: { type: String, default: 'markdown' },
  storageKey: String,
  showCopyPath: Boolean,
  showCopyContent: Boolean,
  onSave: Function,
  onClose: Function,
});

const editorEl = ref(null);
const previewEl = ref(null);

const title = ref('');
const currentFilePath = ref('');
const previewMode = ref(false);
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
  if (api.onFileChanged) {
    api.onFileChanged(onFileChanged);
  }
  editorEl.value?.addEventListener('cm-save', doSave);
});

onUnmounted(() => {
  editorEl.value?.removeEventListener('cm-save', doSave);
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
    if (previewEl.value) previewEl.value.innerHTML = '';
  }

  wrapMode.value = isMd;

  if (!editorView) {
    createEditor(content, filePath, isMd);
  } else {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
    });
    if (editorView._wrapCompartment) {
      editorView.dispatch({
        effects: editorView._wrapCompartment.reconfigure(
          wrapMode.value ? window.CMEditorView.lineWrapping : []
        ),
      });
    }
  }

  if (wantPreview) showPreview();
  watchFile(filePath);
}

function createEditor(content, filePath, isMd) {
  if (props.language === 'auto') {
    editorView = window.createEditableViewer(editorEl.value, content, filePath, { wrap: isMd });
  } else {
    editorView = window.createPlanEditor(editorEl.value);
    if (content) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: content },
      });
    }
    if (editorView._wrapCompartment) {
      editorView.dispatch({
        effects: editorView._wrapCompartment.reconfigure(
          isMd ? window.CMEditorView.lineWrapping : []
        ),
      });
    }
  }
}

function destroy() {
  unwatchFile();
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  if (editorEl.value) {
    delete editorEl.value._cmSearchBar;
    delete editorEl.value._cmGotoLine;
    editorEl.value.innerHTML = '';
  }
  if (previewEl.value) previewEl.value.innerHTML = '';
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
  if (previewEl.value) previewEl.value.innerHTML = window.marked?.parse(content) || content;
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
  editorView.dispatch({
    effects: editorView._wrapCompartment.reconfigure(
      wrapMode.value ? window.CMEditorView.lineWrapping : []
    ),
  });
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
  if (!filePath || !api.watchFile) return;
  watchedPath = filePath;
  api.watchFile(filePath);
}

function unwatchFile() {
  if (watchedPath && api.unwatchFile) {
    api.unwatchFile(watchedPath);
    watchedPath = null;
  }
}

async function reloadFromDisk() {
  if (!currentFilePath.value || !api.readFileForPanel) return;
  const result = await api.readFileForPanel(currentFilePath.value);
  if (!result?.ok) return;
  const newContent = result.content;
  if (newContent === getContent()) return;
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: newContent },
    });
  }
  if (previewMode.value && previewEl.value) {
    previewEl.value.innerHTML = window.marked?.parse(newContent) || newContent;
  }
}

defineExpose({ open, destroy, getContent });
</script>
