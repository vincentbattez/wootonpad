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
const SAVE_ICON = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM272 80v80H144V80h128zm122 352H54a6 6 0 0 1-6-6V86a6 6 0 0 1 6-6h42v104c0 13.255 10.745 24 24 24h176c13.255 0 24-10.745 24-24V83.882l78.243 78.243a6 6 0 0 1 1.757 4.243V426a6 6 0 0 1-6 6zM224 232c-48.523 0-88 39.477-88 88s39.477 88 88 88 88-39.477 88-88-39.477-88-88-88zm0 128c-22.056 0-40-17.944-40-40s17.944-40 40-40 40 17.944 40 40-17.944 40-40 40z"></path></svg>';
const WRAP_ICON = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M4 6l16 0"></path><path d="M4 18l5 0"></path><path d="M4 12h13a3 3 0 0 1 0 6h-4l2 -2m0 4l-2 -2"></path></svg>';
const COPY_ICON = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>';
const PREVIEW_ICON = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0h24v24H0z"></path><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5a2 2 0 0 0-2-2zm0 16H5V7h14v12zm-5.5-6c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5zM12 9c-2.73 0-5.06 1.66-6 4 .94 2.34 3.27 4 6 4s5.06-1.66 6-4c-.94-2.34-3.27-4-6-4zm0 6.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"></path></svg>';
const GOTO_LINE_ICON = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"></path><path d="m9 18-1.5-1.5"></path><circle cx="5" cy="14" r="3"></circle></svg>';
const CLOSE_ICON = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M400 145.49 366.51 112 256 222.51 145.49 112 112 145.49 222.51 256 112 366.51 145.49 400 256 289.49 366.51 400 400 366.51 289.49 256 400 145.49z"></path></svg>';
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
