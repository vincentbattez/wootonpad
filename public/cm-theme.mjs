// Pure helper for CodeMirror theme selection. No CodeMirror and no DOM imports,
// so it can be unit-tested under node:test. codemirror-setup.js maps the mode
// this returns onto the actual theme extensions held in a reconfigurable
// compartment.
//
// Editors default to dark: the app has always shipped dark, and window.appearance
// carries the resolved mode at launch so an editor opened before any toggle is
// already in the right theme, with no flash. An unknown or missing mode falls
// back to dark rather than throwing.
export function resolveEditorMode(appearance) {
  return appearance && appearance.mode === 'light' ? 'light' : 'dark';
}
