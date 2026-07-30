// Single place where a theme decision is made.
// Pure Node — no Electron, no DOM. Consumed by the main process (nativeTheme,
// window background) and, through the preload bridge, by the renderer.

const THEMES = ['system', 'light', 'dark'];
const NEUTRAL_TONES = ['mauve', 'gray', 'slate', 'sage', 'olive', 'sand'];

const APPEARANCE_DEFAULTS = {
  theme: 'system',
  neutralTone: 'mauve',
  terminalTheme: 'auto',
};

// Radix mauve step 1 — app background in each mode.
const BACKGROUND_COLORS = { dark: '#121113', light: '#fdfcfd' };

// House terminal presets, one per mode (what `auto` resolves to).
const HOUSE_TERMINAL_THEMES = { dark: 'switchboard', light: 'switchboardLight' };

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function resolveAppearance(settings = {}, systemState = {}) {
  const theme = oneOf(settings?.theme, THEMES, APPEARANCE_DEFAULTS.theme);
  const neutralTone = oneOf(settings?.neutralTone, NEUTRAL_TONES, APPEARANCE_DEFAULTS.neutralTone);
  const terminalTheme = typeof settings?.terminalTheme === 'string' && settings.terminalTheme
    ? settings.terminalTheme
    : APPEARANCE_DEFAULTS.terminalTheme;

  const mode = theme === 'system'
    ? (systemState?.systemPrefersDark ? 'dark' : 'light')
    : theme;

  return {
    theme,
    mode,
    neutralTone,
    htmlClass: mode === 'dark' ? 'dark-theme' : 'light-theme',
    backgroundColor: BACKGROUND_COLORS[mode],
    terminalThemeName: terminalTheme === 'auto' ? HOUSE_TERMINAL_THEMES[mode] : terminalTheme,
  };
}

module.exports = {
  resolveAppearance,
  APPEARANCE_DEFAULTS,
  THEMES,
  NEUTRAL_TONES,
  BACKGROUND_COLORS,
};
