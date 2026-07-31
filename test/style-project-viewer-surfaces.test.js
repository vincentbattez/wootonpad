const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-74 — Light mode: the Project Viewer chrome.
//
// The densest per-surface migration lot of the feature (sibling of
// VIN-67…VIN-70): every hard-written colour from the diff navigation toolbar to
// the end of the stylesheet — the diff nav bar and MergeView container, the
// tabs, the git toolbar, the overview grid and its cards, the file-status
// column, the commit panel and git identity, the Sessions list, the Commits tab
// and its sections, the unpushed badge, the push-destination panel and its
// confirmation dialog, the file tree, the save button, the loading state, the
// generating shimmer and the tooltip — moves onto the token layer so the whole
// Project Viewer stays legible in light mode and coherent in dark. The
// acceptance criterion is exhaustive: no raw colour may survive. Colour has to
// flow through the Radix-backed tokens (var(--…)) or a color-mix() over them,
// never a literal hex / rgb() / hsl() nor a bare black/white keyword.
//
// The CodeMirror-internal diff line/text backgrounds inside the MergeView
// (selectors carrying `.cm-`) are explicitly out of scope — they belong to the
// editor theme migrated under VIN-64 — so they are filtered out below.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

// The Project Viewer chrome runs from the diff navigation toolbar banner to the
// end of the file. Slice from there, then drop CodeMirror-internal rules.
function projectViewerChrome() {
  const start = styleCss.search(/\/\* ─+ Diff navigation toolbar ─+ \*\//);
  assert.notEqual(start, -1, 'diff navigation toolbar banner not found');
  const region = styleCss.slice(start);
  // Editor-internal MergeView backgrounds (VIN-64) are not this ticket's chrome.
  return region
    .split('\n')
    .filter((line) => !line.includes('.cm-'))
    .join('\n');
}

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). The hex arm rejects a
// trailing identifier char so ID/class selectors starting with hex-looking
// names are not mistaken for colours.
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^)]*\)/g;

test('no raw colour survives in the Project Viewer chrome', () => {
  const body = projectViewerChrome();
  const matches = body.match(RAW_COLOUR) || [];
  assert.deepEqual(
    matches,
    [],
    'expected every colour in the Project Viewer chrome to flow through a ' +
      'token, found: ' + matches.join(', '),
  );
});

test('no bare black/white keyword survives in the Project Viewer chrome', () => {
  // color-mix(..., black) / white was calibrated for a near-black chrome and
  // would not invert with the theme.
  const bare = projectViewerChrome().match(/[,:]\s*(?:black|white)\b/gi) || [];
  assert.deepEqual(
    bare,
    [],
    `expected no bare black/white keyword, found: ${bare.join(', ')}`,
  );
});

// The diff indicators must read through the semantic diff tokens so added /
// modified / deleted stay distinguishable and theme-aware in both modes.
test('the diff indicators flow through the semantic diff tokens', () => {
  const body = projectViewerChrome();
  assert.match(body, /var\(--diff-added\)/, 'added should use --diff-added');
  assert.match(body, /var\(--diff-deleted\)/, 'deleted should use --diff-deleted');
  assert.match(body, /var\(--diff-modified\)/, 'modified should use --diff-modified');
});

// The accent call sites must resolve to a Radix accent ramp, not an ad-hoc rgb.
test('the Project Viewer accents flow through Radix ramps', () => {
  const body = projectViewerChrome();
  assert.match(body, /var\(--indigo-\d+\)/, 'indigo actions/badges should use indigo');
  assert.match(body, /var\(--amber-\d+\)|var\(--status-warning\)/, 'unpushed/push should use amber');
  assert.match(body, /var\(--blue-\d+\)/, 'running containers / new button should use blue');
  assert.match(body, /var\(--status-danger\)|var\(--red-\d+\)/, 'errors should use red');
});
