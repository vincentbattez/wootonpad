const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveAppearance, APPEARANCE_DEFAULTS } = require('../appearance');

test('theme "system" follows the OS: dark system resolves to dark mode', () => {
  const out = resolveAppearance({ theme: 'system' }, { systemPrefersDark: true });
  assert.equal(out.mode, 'dark');
});

test('theme "system" follows the OS: light system resolves to light mode', () => {
  const out = resolveAppearance({ theme: 'system' }, { systemPrefersDark: false });
  assert.equal(out.mode, 'light');
});

test('explicit "light" wins over a dark system', () => {
  const out = resolveAppearance({ theme: 'light' }, { systemPrefersDark: true });
  assert.equal(out.mode, 'light');
});

test('explicit "dark" wins over a light system', () => {
  const out = resolveAppearance({ theme: 'dark' }, { systemPrefersDark: false });
  assert.equal(out.mode, 'dark');
});

test('root class and window background match the resolved mode', () => {
  const dark = resolveAppearance({ theme: 'dark' }, { systemPrefersDark: false });
  const light = resolveAppearance({ theme: 'light' }, { systemPrefersDark: true });

  assert.equal(dark.htmlClass, 'dark-theme');
  assert.equal(light.htmlClass, 'light-theme');
  assert.notEqual(dark.backgroundColor, light.backgroundColor);
  assert.match(dark.backgroundColor, /^#[0-9a-f]{6}$/);
  assert.match(light.backgroundColor, /^#[0-9a-f]{6}$/);
});

test('terminal theme "auto" resolves to the house preset of the current mode', () => {
  const dark = resolveAppearance({ theme: 'dark', terminalTheme: 'auto' }, { systemPrefersDark: false });
  const light = resolveAppearance({ theme: 'light', terminalTheme: 'auto' }, { systemPrefersDark: true });

  assert.equal(dark.terminalThemeName, 'switchboard');
  assert.equal(light.terminalThemeName, 'switchboardLight');
});

test('an explicit terminal preset wins over auto in both modes', () => {
  const dark = resolveAppearance({ theme: 'dark', terminalTheme: 'dracula' }, { systemPrefersDark: false });
  const light = resolveAppearance({ theme: 'light', terminalTheme: 'dracula' }, { systemPrefersDark: true });

  assert.equal(dark.terminalThemeName, 'dracula');
  assert.equal(light.terminalThemeName, 'dracula');
});

test('unknown setting values fall back to the defaults without throwing', () => {
  const out = resolveAppearance(
    { theme: 'neon', neutralTone: 'chartreuse', terminalTheme: 42 },
    { systemPrefersDark: true }
  );

  assert.equal(out.mode, 'dark'); // fell back to 'system', system is dark
  assert.equal(out.neutralTone, 'mauve');
  assert.equal(out.terminalThemeName, 'switchboard'); // fell back to 'auto', mode is dark
});

test('absent settings and absent system state fall back to the defaults', () => {
  assert.deepEqual(APPEARANCE_DEFAULTS, { theme: 'system', neutralTone: 'mauve', terminalTheme: 'auto' });

  const out = resolveAppearance();

  assert.equal(out.theme, 'system');
  assert.equal(out.mode, 'light'); // no system state → not dark
  assert.equal(out.neutralTone, 'mauve');
  assert.equal(out.htmlClass, 'light-theme');
  assert.equal(out.terminalThemeName, 'switchboardLight'); // auto, in light mode
});
