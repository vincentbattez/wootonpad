const test = require('node:test');
const assert = require('node:assert/strict');

const { TERMINAL_THEMES, getTerminalTheme } = require('../public/terminal-themes');

// The 16-colour ANSI palette plus the two surface colours every preset must carry.
const REQUIRED_KEYS = [
  'background', 'foreground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

test('the house dark preset "switchboard" is re-tuned onto the Radix neutral ramp', () => {
  // Migration constraint: the key stays `switchboard`, only the colours move.
  assert.equal(TERMINAL_THEMES.switchboard.background.toLowerCase(), '#121113');
});

test('a house light preset "switchboardLight" exists on the Radix neutral light background', () => {
  assert.ok(TERMINAL_THEMES.switchboardLight, 'switchboardLight preset is defined');
  assert.equal(TERMINAL_THEMES.switchboardLight.background.toLowerCase(), '#fdfcfd');
});

test('both named light presets are available', () => {
  assert.ok(TERMINAL_THEMES.solarizedLight, 'Solarized Light preset is defined');
  assert.ok(TERMINAL_THEMES.catppuccinLatte, 'Catppuccin Latte preset is defined');
});

test('every preset carries a full ANSI palette, a label, and valid hex colours', () => {
  for (const [name, theme] of Object.entries(TERMINAL_THEMES)) {
    assert.equal(typeof theme.label, 'string', `${name} has a label`);
    for (const key of REQUIRED_KEYS) {
      assert.match(theme[key], /^#[0-9a-fA-F]{6}$/, `${name}.${key} is a 6-digit hex colour`);
    }
  }
});

test('getTerminalTheme() returns the house dark preset by default', () => {
  assert.deepEqual(getTerminalTheme(), TERMINAL_THEMES.switchboard);
});

test('the six third-party presets keep their exact recognisable backgrounds', () => {
  assert.equal(TERMINAL_THEMES.ghostty.background, '#292c33');
  assert.equal(TERMINAL_THEMES.tokyoNight.background, '#1a1b26');
  assert.equal(TERMINAL_THEMES.catppuccinMocha.background, '#1e1e2e');
  assert.equal(TERMINAL_THEMES.dracula.background, '#282a36');
  assert.equal(TERMINAL_THEMES.nord.background, '#2e3440');
  assert.equal(TERMINAL_THEMES.solarizedDark.background, '#002b36');
});
