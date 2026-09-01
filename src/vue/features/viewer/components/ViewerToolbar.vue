<template>
  <!-- The viewer's toolbar chrome: title, path and the file actions. A Dumb Component — it takes
       the current state as props and emits the intent, leaving the Container to run CodeMirror,
       the clipboard and the save. Class names are the legacy ones, preserved verbatim. -->
  <div class="viewer-toolbar">
    <div class="viewer-toolbar-info">
      <span class="viewer-toolbar-title">{{ title }}</span>
      <span class="viewer-toolbar-path">{{ path }}</span>
      <button
        v-if="showCopyPath"
        class="viewer-toolbar-copy-path"
        :style="copyPathFlash ? FLASH_STYLE : {}"
        title="Copy file path"
        @click="$emit('copy-path')"
        v-html="COPY_ICON"
      ></button>
    </div>
    <div class="viewer-toolbar-controls">
      <button
        v-show="isMarkdown"
        class="fp-toolbar-btn fp-icon-btn"
        :class="{ active: previewMode }"
        :title="previewMode ? 'Back to editor' : 'Toggle markdown preview'"
        @click="$emit('toggle-preview')"
        v-html="PREVIEW_ICON"
      ></button>
      <button
        v-if="showCopyContent"
        class="fp-toolbar-btn fp-icon-btn"
        :style="copyContentFlash ? FLASH_STYLE : {}"
        title="Copy raw content"
        @click="$emit('copy-content')"
        v-html="COPY_ICON"
      ></button>
      <button
        class="fp-toolbar-btn fp-icon-btn"
        :class="{ active: wrapMode }"
        title="Toggle line wrapping"
        @click="$emit('toggle-wrap')"
        v-html="WRAP_ICON"
      ></button>
      <button
        class="fp-toolbar-btn fp-icon-btn"
        title="Go to line (Cmd+G)"
        @click="$emit('goto-line')"
        v-html="GOTO_LINE_ICON"
      ></button>
      <button
        v-if="canSave"
        class="fp-toolbar-btn fp-save-btn fp-icon-btn"
        :style="saveFlash ? FLASH_STYLE : {}"
        title="Save changes"
        @click="$emit('save')"
        v-html="SAVE_ICON"
      ></button>
      <button
        v-if="canClose"
        class="fp-toolbar-btn fp-close-btn fp-icon-btn"
        title="Close panel"
        @click="$emit('close')"
        v-html="CLOSE_ICON"
      ></button>
    </div>
  </div>
</template>

<script setup>
import { viewerIcons } from '../../../shared/lib/icons.js';

const { SAVE_ICON, WRAP_ICON, COPY_ICON, PREVIEW_ICON, GOTO_LINE_ICON, CLOSE_ICON } = viewerIcons;
const FLASH_STYLE = { color: '#3ecf5a', borderColor: 'rgba(62,207,90,0.4)' };

defineProps({
  title: { type: String, default: '' },
  path: { type: String, default: '' },
  isMarkdown: { type: Boolean, default: false },
  previewMode: { type: Boolean, default: false },
  wrapMode: { type: Boolean, default: false },
  showCopyPath: { type: Boolean, default: false },
  showCopyContent: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  canClose: { type: Boolean, default: false },
  saveFlash: { type: Boolean, default: false },
  copyPathFlash: { type: Boolean, default: false },
  copyContentFlash: { type: Boolean, default: false },
});

defineEmits(['toggle-preview', 'toggle-wrap', 'goto-line', 'save', 'close', 'copy-path', 'copy-content']);
</script>
