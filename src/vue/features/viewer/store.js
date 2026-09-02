import { reactive } from 'vue';

// The viewer Feature store. The frozen renderer's file panel drives the viewer through the
// Feature's Bridge, which writes an open request (and a destroy tick) here rather than calling
// a component through a template ref. The bridged Container watches these and drives CodeMirror,
// the file watching and the IPC — the Feature's single edge.
export const viewerStore = reactive({
  // The file to show: { title, filePath, content, seq }. The seq lets re-opening the same file
  // re-trigger the watcher.
  openRequest: null,

  // Bumped to ask the bridged Container to tear its editor down.
  destroySeq: 0,
});
