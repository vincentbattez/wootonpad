// The viewer Feature's Bridge to the frozen legacy renderer. public/file-panel.js opens and
// tears down the file panel's viewer through window.createViewerPanel; those calls flow through
// here, writing the Feature store instead of reaching a component ref, so the panel that shows
// the file can be a Dumb Component reading the store through its Container. app.js and its
// siblings are frozen, so these names and signatures are the contract.
export function createViewerBridge(store) {
  let seq = 0;
  return {
    open(title, filePath, content) {
      store.openRequest = { title, filePath, content, seq: ++seq };
    },
    destroy() {
      store.destroySeq += 1;
    },
  };
}
