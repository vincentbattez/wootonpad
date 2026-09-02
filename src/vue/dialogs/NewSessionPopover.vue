<template>
  <Teleport to="body">
    <div v-if="popover" ref="popoverEl" class="new-session-popover" :style="popoverStyle">
      <button class="popover-option" @click="choose('onClaude')">
        <span class="popover-option-icon claude-icon" v-html="CLAUDE_SVG"></span> Claude
      </button>
      <button class="popover-option" @click="choose('onClaudeConfig')">
        <span class="popover-option-icon claude-icon" v-html="CLAUDE_SVG"></span> Claude (Configure...)
      </button>
      <button class="popover-option popover-option-terminal" @click="choose('onTerminal')">
        <span class="popover-option-icon terminal-icon" v-html="TERMINAL_SVG"></span> Terminal
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { newSessionPopoverIcons } from '../shared/lib/icons.js';
import { dialogStore, closePopover } from './dialog-store.js';
import { useDialogKeys } from './use-dialog-keys.js';
const { CLAUDE_SVG, TERMINAL_SVG } = newSessionPopoverIcons;


const popover = computed(() => dialogStore.popover);
const popoverEl = ref(null);
const popoverStyle = ref({});
let outsideHandler = null;

useDialogKeys('popover', { onEscape: close });

// Position against the anchor once the element has laid out, then arm the outside-click guard.
watch(popover, async (p) => {
  removeOutsideHandler();
  if (!p) return;
  popoverStyle.value = { position: 'fixed', top: '0', left: '-9999px', visibility: 'hidden' };
  await nextTick();
  if (!popoverEl.value) return;
  const pw = popoverEl.value.offsetWidth;
  const ph = popoverEl.value.offsetHeight;
  const anchorEl = p.anchorEl;
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + 4 + ph > window.innerHeight ? rect.top - ph - 4 : rect.bottom + 4;
    const left = Math.max(8, rect.right - pw);
    popoverStyle.value = { position: 'fixed', top: top + 'px', left: left + 'px' };
  } else {
    popoverStyle.value = {
      position: 'fixed',
      top: Math.max(8, window.innerHeight / 2 - ph / 2) + 'px',
      left: Math.max(8, window.innerWidth / 2 - pw / 2) + 'px',
    };
  }
  setTimeout(() => {
    outsideHandler = (e) => {
      if (popoverEl.value && !popoverEl.value.contains(e.target) && e.target !== anchorEl) close();
    };
    document.addEventListener('mousedown', outsideHandler);
  }, 0);
});

function removeOutsideHandler() {
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler);
    outsideHandler = null;
  }
}

function close() {
  closePopover();
  removeOutsideHandler();
}

function choose(name) {
  const p = dialogStore.popover;
  const project = p?.project;
  const cbs = p?.cbs || {};
  close();
  cbs[name]?.(project);
}

onUnmounted(removeOutsideHandler);
</script>
