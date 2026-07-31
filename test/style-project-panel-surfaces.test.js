const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-71 — Light mode: the MCP-bridge file panel, Project / Area avatars and
// the Projects / Areas management panel.
//
// A per-surface migration lot (sibling of VIN-67 … VIN-70): the hard-written
// colours in the MCP-bridge file panel (toolbar buttons, accept/reject diff
// actions, its MergeView line highlights, the account badge and MCP toggle),
// the Project / Area / management-panel avatars, and the Projects / Areas
// management panel move onto the token layer so every surface stays legible in
// light mode and coherent in dark. Avatars carry white glyphs on generated
// saturated fills, so their text rides the mode-independent white-alpha step
// rather than a bare `white` keyword calibrated for the old near-black chrome.
//
// The acceptance criterion is exhaustive — no raw colour may survive in these
// sections. Colour has to flow through the Radix-backed tokens (var(--…)) or a
// color-mix() over them, never a literal hex / rgb() / hsl() nor a bare
// black/white keyword. The Project Viewer (its own banner below) is a distinct
// ticket (VIN-74) and is out of scope here.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

// Slice out one "/* ==… TITLE ==… */" section, up to the next such banner (or
// end of file). Returns the section body without its header. Handles both the
// full "========== TITLE ==========" and the half "===== Title =====" banners.
function section(title) {
  const banner = new RegExp(`/\\* =+ ${title} =+ \\*/`);
  const start = styleCss.search(banner);
  assert.notEqual(start, -1, `section "${title}" not found`);
  const headerEnd = styleCss.indexOf('*/', start) + 2;
  const after = styleCss.slice(headerEnd);
  const nextBanner = after.search(/\/\* =+ [A-Za-z]/);
  return nextBanner === -1 ? after : after.slice(0, nextBanner);
}

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). The hex arm rejects a
// trailing identifier char so ID selectors such as `#file-panel` are not
// mistaken for colours.
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^)]*\)/g;

for (const title of [
  'FILE PANEL \\(MCP Bridge\\)',
  'Project header avatar',
  'Projects management panel',
]) {
  const label = title.replace(/\\/g, '');
  test(`no raw colour survives in the ${label} section`, () => {
    const body = section(title);
    const matches = body.match(RAW_COLOUR) || [];
    assert.deepEqual(
      matches,
      [],
      `expected every colour in ${label} to flow through a token, found: ` +
        matches.join(', '),
    );
  });

  test(`no bare black/white keyword survives in the ${label} section`, () => {
    const bare = section(title).match(/[,:]\s*(?:black|white)\b/gi) || [];
    assert.deepEqual(
      bare,
      [],
      `expected no bare black/white keyword in ${label}, found: ${bare.join(', ')}`,
    );
  });
}

// Avatar glyphs sit on generated saturated fills; their text must ride the
// mode-independent white-alpha step so it stays legible in both themes.
test('Project and Area avatars carry their glyph on the white-alpha step', () => {
  const avatars = section('Project header avatar');
  assert.match(avatars, /var\(--white-a\d+\)/, 'avatar text should use white-alpha');
  const panel = section('Projects management panel');
  assert.match(
    panel,
    /\.project-card-avatar[^}]*var\(--white-a\d+\)/,
    'the management-panel avatar should use white-alpha',
  );
});

// Accent call sites must resolve to a Radix accent ramp, not an ad-hoc value.
test('the MCP file-panel diff actions flow through the green and red accents', () => {
  const fp = section('FILE PANEL \\(MCP Bridge\\)');
  assert.match(fp, /var\(--green-\d+\)/, 'the save/accept action should use green');
  assert.match(fp, /var\(--red-\d+\)/, 'the reject action should use red');
  assert.match(fp, /var\(--indigo-\d+\)/, 'the active toolbar / account badge should use indigo');
  assert.match(fp, /var\(--diff-added\)/, 'MergeView additions should use the diff-added token');
  assert.match(fp, /var\(--diff-deleted\)/, 'MergeView deletions should use the diff-deleted token');
});

test('the management panel container status flows through the status tokens', () => {
  const panel = section('Projects management panel');
  assert.match(panel, /var\(--status-running\)/, 'a running container dot should use status-running');
  assert.match(panel, /var\(--status-warning\)/, 'a starting container should use status-warning');
  assert.match(panel, /var\(--blue-\d+\)/, 'the new-session action should use blue');
});
