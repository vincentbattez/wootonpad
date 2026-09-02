<template>
  <div id="terminal-area">
    <div id="vue-session-header">
      <SessionHeaderContainer />
    </div>
    <!-- Legacy terminal header kept for JS references (hidden) -->
    <div id="terminal-header" style="display:none;">
      <div id="terminal-header-info">
        <span id="terminal-header-name"></span>
        <span id="terminal-header-pty-title" style="display:none;"></span>
        <span id="terminal-header-id"></span>
        <span id="terminal-header-shell" style="display:none;"></span>
        <span id="terminal-header-account" class="terminal-account-badge" style="display:none;"></span>
      </div>
      <div id="terminal-header-controls">
        <span id="terminal-header-status"></span>
        <button id="terminal-stop-btn" data-tooltip="Stop process">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>
        </button>
      </div>
    </div>
    <div id="grid-viewer" v-show="store.gridViewActive">
      <div id="grid-viewer-header">
        <span id="grid-viewer-title">Session Overview</span>
        <span id="grid-viewer-count">{{ store.gridViewerCount }}</span>
      </div>
    </div>
    <div id="terminals"></div>
  </div>
</template>

<script setup>
// The terminal main surface: the Vue Session header, the hidden legacy terminal header
// the vanilla renderer still queries by ID, the grid-overview header and the #terminals
// mount point xterm.js owns. Only the Session header is a Container; the rest is the
// frozen DOM the renderer drives directly.
import { store } from '../store.js';
import SessionHeaderContainer from '../features/sessions/containers/SessionHeaderContainer.vue';
</script>
