const test = require('node:test');
const assert = require('node:assert/strict');

const { KNOWN_IDES, resolveIdeLaunch } = require('../ide-launch');

test('a known IDE resolves to `open -b <bundle id> <dir>`', () => {
  const out = resolveIdeLaunch({ externalIde: 'vscode' }, '/Users/me/proj', 'darwin');

  assert.equal(out.ok, true);
  assert.equal(out.mode, 'bundle');
  assert.equal(out.file, '/usr/bin/open');
  assert.deepEqual(out.args, ['-b', 'com.microsoft.VSCode', '/Users/me/proj']);
  assert.equal(out.ideLabel, 'Visual Studio Code');
});

test('every known IDE carries an id, a label and a bundle id', () => {
  for (const ide of KNOWN_IDES) {
    assert.ok(ide.id && ide.label && ide.bundleId, `incomplete entry: ${JSON.stringify(ide)}`);
    assert.match(ide.bundleId, /^[A-Za-z0-9.-]+$/);
  }
  assert.equal(new Set(KNOWN_IDES.map(i => i.id)).size, KNOWN_IDES.length);
  assert.ok(!KNOWN_IDES.some(i => i.id === 'custom'), '"custom" is reserved for the free-form command');
});

test('a custom command gets the directory appended as a quoted final argument', () => {
  const out = resolveIdeLaunch(
    { externalIde: 'custom', externalIdeCommand: 'code -n' },
    '/Users/me/proj',
    'darwin'
  );

  assert.equal(out.ok, true);
  assert.equal(out.mode, 'custom');
  assert.equal(out.command, "code -n '/Users/me/proj'");
});

test('a path with spaces and apostrophes survives sh quoting', () => {
  const out = resolveIdeLaunch(
    { externalIde: 'custom', externalIdeCommand: 'code' },
    "/Users/me/it's a project",
    'darwin'
  );

  assert.equal(out.command, "code '/Users/me/it'\\''s a project'");

  // Round-trip through a real shell: the command must see exactly one argument.
  const { execFileSync } = require('node:child_process');
  const echoed = execFileSync('/bin/sh', ['-c', out.command.replace(/^code/, 'printf %s')], { encoding: 'utf8' });
  assert.equal(echoed, "/Users/me/it's a project");
});

test('a known IDE off macOS reports an explicit unsupported-platform error', () => {
  const out = resolveIdeLaunch({ externalIde: 'vscode' }, '/home/me/proj', 'linux');

  assert.equal(out.ok, false);
  assert.equal(out.code, 'unsupported-platform');
  assert.equal(out.ideLabel, 'Visual Studio Code');
  assert.match(out.message, /Custom/);
});

test('a custom command still works off macOS', () => {
  const out = resolveIdeLaunch(
    { externalIde: 'custom', externalIdeCommand: 'code' },
    '/home/me/proj',
    'linux'
  );

  assert.equal(out.ok, true);
  assert.equal(out.mode, 'custom');
});

test('"custom" with an empty or blank command behaves as not configured', () => {
  for (const command of [undefined, '', '   ']) {
    const out = resolveIdeLaunch({ externalIde: 'custom', externalIdeCommand: command }, '/d', 'darwin');
    assert.equal(out.ok, false);
    assert.equal(out.code, 'not-configured');
  }
});

test('an absent, null or unknown IDE setting is not configured', () => {
  for (const settings of [undefined, {}, { externalIde: null }, { externalIde: '' }, { externalIde: 'emacs' }]) {
    const out = resolveIdeLaunch(settings, '/d', 'darwin');
    assert.equal(out.ok, false, `expected not-configured for ${JSON.stringify(settings)}`);
    assert.equal(out.code, 'not-configured');
    assert.ok(out.message);
  }
});
