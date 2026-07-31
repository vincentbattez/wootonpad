const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-73 — Relecture visuelle des deux modes, contrastes WCAG AA et note de
// renvoi. The closing (contract) ticket of PRD VIN-60.
//
// The per-surface siblings (VIN-67…VIN-74) each migrated one region and guarded
// it with its own test. This is the *whole-sheet* exhaustiveness contract:
// acceptance criterion #1 is "aucune couleur écrite en dur ne subsiste hors de
// la couche de tokens, dans TOUTE la feuille de style". So rather than trust the
// union of the per-surface slices to cover every line, this guard scans the
// entire stylesheet body — everything after the design-system token block — in
// one pass, and asserts that no raw colour survives outside the token layer.
//
// The token layer itself (the `:root` blocks up to and including the
// "End of Design System Tokens" banner) is where literal colours legitimately
// live — the `*-contrast` steps and the neutral-tone / accent aliases. It is
// excluded from the scan; a raw colour there is the token layer doing its job.
//
// One documented exception survives in the body: the four CodeMirror-internal
// MergeView diff backgrounds (selectors carrying `.cm-`). They belong to the
// editor theme migrated under VIN-64, are explicitly out of scope for the CSS
// chrome migration, and are filtered out — the same carve-out every sibling
// test makes. Their presence is asserted below so the exception stays a known,
// enumerated pocket and not a silent hole: if the count ever changes, this test
// forces the carve-out to be re-justified.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

// The stylesheet body: everything after the design-system token block. Literal
// colours before this marker are the token layer and are meant to be there.
function stylesheetBody() {
  const marker = /\/\* ─+ End of Design System Tokens ─+ \*\//;
  const end = styleCss.search(marker);
  assert.notEqual(end, -1, 'End of Design System Tokens banner not found');
  return styleCss.slice(end);
}

// The body with the out-of-scope CodeMirror MergeView rules removed.
function migratedBody() {
  return stylesheetBody()
    .split('\n')
    .filter((line) => !line.includes('.cm-'))
    .join('\n');
}

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). The hex arm rejects a
// trailing identifier char so ID/class selectors starting with hex-looking
// names (e.g. #add-area-btn) are not mistaken for colours. Same regex the
// per-surface sibling tests use.
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^)]*\)/g;

test('no raw colour survives anywhere in the migrated stylesheet body', () => {
  const matches = migratedBody().match(RAW_COLOUR) || [];
  assert.deepEqual(
    matches,
    [],
    'every colour in the app chrome must flow through a token; found raw ' +
      'colours: ' + matches.join(', '),
  );
});

test('no bare black/white keyword survives in the migrated stylesheet body', () => {
  // color-mix(..., black|white) was calibrated for a near-black chrome and does
  // not invert with the theme; it must go through a token instead.
  const bare = migratedBody().match(/[,:]\s*(?:black|white)\b/gi) || [];
  assert.deepEqual(
    bare,
    [],
    `expected no bare black/white keyword, found: ${bare.join(', ')}`,
  );
});

test('the only surviving raw colours are the documented .cm- MergeView rules', () => {
  // Everything the migration left behind must be enumerable and out of scope.
  // The full body minus the migrated body is exactly the CodeMirror lines.
  const bodyColours = (stylesheetBody().match(RAW_COLOUR) || []).length;
  const migratedColours = (migratedBody().match(RAW_COLOUR) || []).length;
  const cmColours = bodyColours - migratedColours;
  assert.equal(
    migratedColours,
    0,
    'the migrated chrome must be colour-clean',
  );
  assert.ok(
    cmColours > 0,
    'expected the out-of-scope CodeMirror MergeView backgrounds to still be ' +
      'present as the single documented exception',
  );
  const cmLines = stylesheetBody()
    .split('\n')
    .filter((line) => line.includes('.cm-') && RAW_COLOUR.test(line));
  for (const line of cmLines) {
    assert.match(
      line,
      /\.cm-/,
      'a surviving raw colour must belong to a .cm- (editor theme, VIN-64) rule',
    );
  }
});

// Acceptance criterion #5: docs/customizing-colors.md must carry a cross-
// reference note pointing readers at the native theme setting, so the person
// who followed the old app.asar-unpacking guide finds the supported path and no
// longer loses their customisation on every auto-update.
test('customizing-colors.md carries a cross-reference to the native theme setting', () => {
  const doc = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'customizing-colors.md'),
    'utf8',
  );
  // A dedicated note near the top, not buried at the end.
  const head = doc.slice(0, 2500);
  assert.match(
    head,
    /r[ée]glage|param[èe]tre|native|natif/i,
    'the note must point at the native/in-app theme setting',
  );
  assert.match(
    head,
    /th[èe]me|theme/i,
    'the note must mention the theme setting',
  );
  // The note must explicitly supersede the app.asar manipulation.
  assert.match(
    doc,
    /(app\.asar|d[ée]paqueter|d[ée]sormais|obsol[èe]te|plus besoin)/i,
    'the note must frame the manual app.asar edit as no longer necessary',
  );
});
